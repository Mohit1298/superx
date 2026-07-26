/** WhatsApp webhook — Vercel serverless entrypoint. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { config } from "../src/config.js";
import { markProcessed } from "../src/db.js";
import { extractIncoming, sendTypingIndicator, sendWhatsAppText } from "../src/channels/whatsapp.js";
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
        await sendTypingIndicator(msg.waMessageId);
        await handleIncomingMessage(msg.from, msg.text, sendWhatsAppText);
      }
    })().catch((e) => console.error("[webhook]", e))
  );
}
