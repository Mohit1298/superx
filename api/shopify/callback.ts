/** OAuth redirect target: exchanges the code, registers webhooks, syncs catalog. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  checkState,
  exchangeCodeForToken,
  normalizeShop,
  registerWebhooks,
  shopifyConfigured,
  verifyOAuthQuery,
} from "../../src/shopify.js";
import { syncCatalog } from "../../src/shopify.js";
import { upsertMerchant } from "../../src/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!shopifyConfigured()) {
    res.status(503).send("not configured");
    return;
  }
  const shop = normalizeShop(String(req.query.shop ?? ""));
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (!shop || !code || !checkState(shop, state) || !verifyOAuthQuery(req.query as Record<string, unknown>)) {
    res.status(400).send("invalid install request");
    return;
  }
  try {
    const token = await exchangeCodeForToken(shop, code);
    await upsertMerchant(shop, token);
    await registerWebhooks(shop, token);
    const count = await syncCatalog(shop, token);
    res
      .status(200)
      .send(
        `<h2>SuperX connected 🎉</h2><p>${shop} is live: ${count} product variants synced. ` +
          `Shoppy now answers with your real-time prices and stock. You can close this tab.</p>`
      );
  } catch (err) {
    console.error("[shopify] install failed:", err);
    res.status(500).send("install failed — check server logs");
  }
}
