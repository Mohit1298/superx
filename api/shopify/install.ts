/** Merchant entry point: /api/shopify/install?shop=my-store.myshopify.com */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getMerchant } from "../../src/db.js";
import { installUrl, normalizeShop, shopifyConfigured } from "../../src/shopify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!shopifyConfigured()) {
    res.status(503).send("Shopify app not configured yet");
    return;
  }
  const shop = normalizeShop(String(req.query.shop ?? ""));
  if (!shop) {
    res.redirect(302, "/connect.html");
    return;
  }
  // Installed stores (e.g. merchant clicking the app inside admin) go straight
  // to their dashboard; only new stores enter OAuth.
  if (await getMerchant(shop)) {
    res.redirect(302, `/api/shopify/dashboard?shop=${encodeURIComponent(shop)}`);
    return;
  }
  res.redirect(302, installUrl(shop));
}
