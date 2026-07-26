/**
 * Shopify partner app plumbing: OAuth install, webhook verification, and
 * catalog sync. Merchants install via /api/shopify/install?shop=x.myshopify.com;
 * product webhooks keep partner_products live from then on.
 */
import crypto from "node:crypto";
import { config } from "./config.js";
import { getMerchant, upsertMerchant, upsertPartnerProduct } from "./db.js";

const API_VERSION = "2026-01";

export function shopifyConfigured(): boolean {
  return Boolean(config.shopify.apiKey && config.shopify.apiSecret);
}

/** Only *.myshopify.com hosts are valid OAuth targets. */
export function normalizeShop(shop: string): string | null {
  const s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

// Stateless CSRF token for the OAuth round-trip: HMAC(shop|ts) with our secret.
export function makeState(shop: string): string {
  const ts = Date.now().toString(36);
  const sig = crypto.createHmac("sha256", config.shopify.apiSecret).update(`${shop}|${ts}`).digest("hex").slice(0, 24);
  return `${ts}.${sig}`;
}

export function checkState(shop: string, state: string): boolean {
  const [ts, sig] = state.split(".");
  if (!ts || !sig) return false;
  const expect = crypto.createHmac("sha256", config.shopify.apiSecret).update(`${shop}|${ts}`).digest("hex").slice(0, 24);
  const fresh = Date.now() - parseInt(ts, 36) < 15 * 60 * 1000;
  return fresh && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}

export function installUrl(shop: string): string {
  const params = new URLSearchParams({
    client_id: config.shopify.apiKey,
    scope: "read_products",
    redirect_uri: `${config.shopify.appUrl}/api/shopify/callback`,
    state: makeState(shop),
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

/** Verify the hmac query param Shopify signs OAuth redirects with. */
export function verifyOAuthQuery(query: Record<string, unknown>): boolean {
  const { hmac, ...rest } = query as Record<string, string>;
  if (!hmac) return false;
  const msg = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? (rest[k] as unknown as string[]).join(",") : rest[k]}`)
    .join("&");
  const digest = crypto.createHmac("sha256", config.shopify.apiSecret).update(msg).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

/** Verify X-Shopify-Hmac-Sha256 over the RAW webhook body. */
export function verifyWebhook(rawBody: Buffer, hmacHeader: string | undefined): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac("sha256", config.shopify.apiSecret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.shopify.apiKey,
      client_secret: config.shopify.apiSecret,
      code,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data.access_token;
}

async function adminFetch(shop: string, token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

const WEBHOOK_TOPICS = ["products/update", "products/create", "products/delete", "app/uninstalled"];

export async function registerWebhooks(shop: string, token: string): Promise<void> {
  for (const topic of WEBHOOK_TOPICS) {
    const res = await adminFetch(shop, token, "webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: { topic, address: `${config.shopify.appUrl}/api/shopify/webhook`, format: "json" },
      }),
    });
    // 422 = already registered from a prior install; fine.
    if (!res.ok && res.status !== 422) {
      console.error(`[shopify] webhook ${topic} registration failed (${res.status}):`, await res.text());
    }
  }
}

/** Pull the full product catalog on install (paginated; capped defensively). */
export async function syncCatalog(shop: string, token?: string): Promise<number> {
  const merchant = token ? { access_token: token } : await getMerchant(shop);
  if (!merchant) throw new Error(`no merchant for ${shop}`);
  await upsertMerchant(shop, merchant.access_token);

  let count = 0;
  let url = `products.json?limit=250&status=active`;
  for (let page = 0; page < 8 && url; page++) {
    const res = await adminFetch(shop, merchant.access_token, url);
    if (!res.ok) throw new Error(`catalog sync failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { products?: Array<Parameters<typeof upsertPartnerProduct>[1]> };
    for (const p of data.products ?? []) {
      await upsertPartnerProduct(shop, p);
      count++;
    }
    // Cursor pagination lives in the Link header.
    const link = res.headers.get("link") ?? "";
    const next = /<[^>]*\/products\.json\?([^>]*)>;\s*rel="next"/.exec(link);
    url = next ? `products.json?${next[1]}` : "";
  }
  return count;
}
