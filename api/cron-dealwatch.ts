/** Hourly wishlist deal-watch — triggered by Vercel Cron (see vercel.json). */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runDealWatch } from "../src/dealwatch.js";
import { sendWhatsAppText, whatsappConfigured } from "../src/channels/whatsapp.js";
import { config } from "../src/config.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!config.dealWatch.enabled || !whatsappConfigured()) {
    res.status(200).json({ skipped: true });
    return;
  }
  const s = await runDealWatch(sendWhatsAppText);
  console.log(`[dealwatch] checked=${s.checked} pinged=${s.pinged} stored=${s.stored} errors=${s.errors}`);
  res.status(200).json(s);
}
