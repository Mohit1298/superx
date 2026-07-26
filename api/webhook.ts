/** WhatsApp webhook — Vercel serverless entrypoint. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { config } from "../src/config.js";
import { markProcessed, withUserLock } from "../src/db.js";
import {
  downloadWhatsAppMedia,
  extractIncoming,
  sendTypingIndicator,
  sendWhatsAppText,
} from "../src/channels/whatsapp.js";
import { handleIncomingMessage } from "../src/agent/brain.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Meta verification handshake
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === config.whatsapp.verifyToken && typeof challenge === "string") {
      res.status(200).send(challenge);
    } else {
      res.status(403).send("forbidden");
    }
    return;
  }
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }

  // Ack Meta immediately; keep the function alive for processing via waitUntil.
  res.status(200).send("ok");
  waitUntil(
    (async () => {
      for (const msg of extractIncoming(req.body)) {
        if (!(await markProcessed(msg.waMessageId))) continue; // duplicate delivery
        if (msg.unsupported) {
          await sendWhatsAppText(
            msg.from,
            `I can read text and photos for now — send a screenshot or a link and I'm on it 🙂`
          );
          continue;
        }
        await sendTypingIndicator(msg.waMessageId);
        const image = msg.imageId ? ((await downloadWhatsAppMedia(msg.imageId)) ?? undefined) : undefined;
        if (msg.imageId && !image) {
          await sendWhatsAppText(msg.from, `Hmm, that image didn't come through — mind resending it, or paste the link instead?`);
          continue;
        }
        const text = msg.text?.trim() ? msg.text : image ? "[sent a photo]" : "";
        if (!text && !image) continue;
        // Bursts arrive as parallel invocations; the advisory lock serializes
        // turns per member so replies stay ordered and in-context.
        await withUserLock(msg.from, () => handleIncomingMessage(msg.from, text, sendWhatsAppText, image));
      }
    })().catch((e) => console.error("[webhook]", e))
  );
}
