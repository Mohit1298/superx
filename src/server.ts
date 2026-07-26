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

  // Minimal legal pages: crawlers (incl. Meta business checks) and diligent
  // humans look for these; we store user messages, so say so plainly.
  const page = (title: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — SuperX</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.65;color:#1a1f1c}h1{font-size:26px}a{color:#128c4b}</style></head><body><h1>${title}</h1>${body}<p><a href="/">← SuperX</a></p></body></html>`;

  app.get("/privacy", (_req, res) => {
    res.send(
      page(
        "Privacy",
        `<p><b>What we store:</b> your WhatsApp phone number, your messages with Shoppy, and any wishlist items you ask us to watch. That's what makes the product work — price checks, memory, and deal alerts.</p>
         <p><b>What we don't do:</b> sell your data, share your conversations with advertisers, or message people you know.</p>
         <p><b>Processing:</b> messages are processed by Anthropic's Claude to generate replies, delivered via Meta's WhatsApp Business Platform, and stored in our database in Canada-accessible cloud infrastructure.</p>
         <p><b>Your controls:</b> text "stop" to opt out of proactive alerts, or ask Shoppy to delete your data and we'll remove your account, messages, and wishlist.</p>
         <p>Questions: message Shoppy or email mohitab2005@gmail.com.</p>`
      )
    );
  });

  app.get("/terms", (_req, res) => {
    res.send(
      page(
        "Terms",
        `<p>SuperX ("Shoppy") is a free beta shopping assistant on WhatsApp, operated from Toronto, Canada.</p>
         <p><b>No guarantees:</b> price checks and deal verdicts are best-effort information, not offers or financial advice — always confirm the price with the retailer before buying.</p>
         <p><b>Fair use:</b> personal, lawful use only; abusive traffic may be rate-limited or blocked.</p>
         <p><b>Beta:</b> the service may change or pause at any time while in beta.</p>`
      )
    );
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
