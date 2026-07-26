/** Product webhooks keep the partner catalog live; HMAC over the raw body. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyWebhook } from "../../src/shopify.js";
import { deletePartnerProduct, removeMerchant, upsertPartnerProduct } from "../../src/db.js";

export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }
  const raw = await readRawBody(req);
  if (!verifyWebhook(raw, req.headers["x-shopify-hmac-sha256"] as string | undefined)) {
    res.status(401).send("bad hmac");
    return;
  }
  const topic = String(req.headers["x-shopify-topic"] ?? "");
  const shop = String(req.headers["x-shopify-shop-domain"] ?? "");
  res.status(200).send("ok"); // ack fast; Shopify retries slow responders

  try {
    const payload = JSON.parse(raw.toString("utf8"));
    if (topic === "app/uninstalled") {
      await removeMerchant(shop);
    } else if (topic === "products/delete") {
      await deletePartnerProduct(shop, Number(payload.id));
    } else if (topic === "products/update" || topic === "products/create") {
      await upsertPartnerProduct(shop, payload);
    } else if (topic === "customers/data_request" || topic === "customers/redact") {
      // Mandatory GDPR topics. We never receive or store store-customer data
      // (read_products only), so there is nothing to return or redact.
      console.log(`[shopify] compliance ${topic} for ${shop}: no customer data held`);
    } else if (topic === "shop/redact") {
      await removeMerchant(shop); // idempotent; products cascade
    }
  } catch (err) {
    console.error(`[shopify] webhook ${topic} for ${shop} failed:`, err);
  }
}
