import express from "express";
import { config } from "./config.js";
import { markProcessed } from "./db.js";
import { enqueue, handleIncomingMessage } from "./agent/brain.js";
import { extractIncoming, sendWhatsAppText } from "./channels/whatsapp.js";

export function createServer() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "superx" });
  });

  // Root: hand humans straight to the WhatsApp chat.
  app.get("/", (_req, res) => {
    res.redirect(`https://wa.me/${config.waLinkNumber}?text=hi`);
  });

  // Meta webhook verification handshake
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === config.whatsapp.verifyToken && typeof challenge === "string") {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Inbound messages. Ack immediately; process async with per-user ordering.
  app.post("/webhook", (req, res) => {
    res.sendStatus(200);
    (async () => {
      for (const msg of extractIncoming(req.body)) {
        if (!(await markProcessed(msg.waMessageId))) continue; // duplicate delivery
        enqueue(msg.from, () => handleIncomingMessage(msg.from, msg.text, sendWhatsAppText));
      }
    })().catch((e) => console.error("[webhook]", e));
  });

  return app;
}

// Vercel's Express preset loads this module directly and requires the app as
// the default export. Local/server-ful runs use createServer() via index.ts.
const app = createServer();
export default app;
