/** Merchant entry point: /api/shopify/install?shop=my-store.myshopify.com */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { installUrl, normalizeShop, shopifyConfigured } from "../../src/shopify.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!shopifyConfigured()) {
    res.status(503).send("Shopify app not configured yet");
    return;
  }
  const shop = normalizeShop(String(req.query.shop ?? ""));
  if (!shop) {
    res.status(400).send("pass ?shop=your-store.myshopify.com");
    return;
  }
  res.redirect(302, installUrl(shop));
}
