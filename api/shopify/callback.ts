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
import { page } from "../../src/merchant-pages.js";

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
    await syncCatalog(shop, token);
    // Straight into the app UI (review requirement + a real merchant home).
    res.redirect(302, `/api/shopify/dashboard?shop=${encodeURIComponent(shop)}&installed=1`);
  } catch (err) {
    console.error("[shopify] install failed:", err);
    res.status(500).send(
      page(`
        <img class="logo" src="https://superx-ten.vercel.app/logo.png" alt="SuperX">
        <h1>Almost there</h1>
        <p class="sub">The connection hiccuped on our side — nothing is broken on your store.</p>
        <p class="sub">Try the install link once more in a minute. If it keeps happening, email
        <a href="mailto:mohitab2005@gmail.com">mohitab2005@gmail.com</a> and we'll fix it fast.</p>`)
    );
  }
}
