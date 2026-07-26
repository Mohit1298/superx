/** Merchant app UI: live sync status for an installed store. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getMerchant, partnerStats } from "../../src/db.js";
import { normalizeShop } from "../../src/shopify.js";
import { dashboardHtml, page } from "../../src/merchant-pages.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shop = normalizeShop(String(req.query.shop ?? ""));
  if (!shop || !(await getMerchant(shop))) {
    res.redirect(302, "/connect.html");
    return;
  }
  const stats = await partnerStats(shop);
  res.status(200).send(
    page(
      dashboardHtml({
        shop,
        variants: stats.variants,
        products: stats.products,
        lastUpdate: stats.last_update,
        justInstalled: req.query.installed === "1",
      })
    )
  );
}
