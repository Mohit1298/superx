import { config } from "../config.js";

const MAX_LEN = 3800; // WhatsApp text cap is 4096; leave headroom

function chunks(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_LEN) {
    let cut = rest.lastIndexOf("\n", MAX_LEN);
    if (cut < MAX_LEN / 2) cut = MAX_LEN;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export function whatsappConfigured(): boolean {
  return Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);
}

/** Send a free-form text message via the WhatsApp Cloud API. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  for (const part of chunks(body)) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/[^0-9]/g, ""),
        type: "text",
        text: { body: part },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
    }
  }
}

/**
 * Send an approved template message — the only way to reach a member whose
 * 24h service window has closed (e.g. deal-watch pings to quiet users).
 */
export async function sendWhatsAppTemplate(to: string, name: string, lang: string, params: string[]): Promise<void> {
  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/[^0-9]/g, ""),
      type: "template",
      template: {
        name,
        language: { code: lang },
        components: [
          { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
        ],
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp template send failed (${res.status}): ${detail}`);
  }
}

/**
 * Mark an inbound message read and show "typing…" while the brain works.
 * Cosmetic: never throws — a failed indicator must not cost anyone a reply.
 * WhatsApp clears it when we send, or after ~25s on the longest turns.
 */
export async function sendTypingIndicator(waMessageId: string): Promise<void> {
  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
        typing_indicator: { type: "text" },
      }),
    });
    if (!res.ok) {
      console.error(`[whatsapp] typing indicator failed (${res.status}):`, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[whatsapp] typing indicator error:", err instanceof Error ? err.message : err);
  }
}

export interface IncomingMessage {
  waMessageId: string;
  from: string; // sender phone in international format, no '+'
  text?: string; // text body, or the image caption
  imageId?: string; // Cloud API media id when the member sent a photo
  unsupported?: string; // message type we can't read yet (audio, video, ...)
}

/** Pull text and image messages out of a Cloud API webhook payload. */
export function extractIncoming(body: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: unknown[] }[]) {
    for (const change of (entry.changes ?? []) as { value?: { messages?: unknown[] } }[]) {
      for (const msg of (change.value?.messages ?? []) as {
        id?: string;
        from?: string;
        type?: string;
        text?: { body?: string };
        image?: { id?: string; caption?: string };
      }[]) {
        if (!msg.id || !msg.from) continue;
        if (msg.type === "text" && msg.text?.body) {
          out.push({ waMessageId: msg.id, from: msg.from, text: msg.text.body });
        } else if (msg.type === "image" && msg.image?.id) {
          out.push({ waMessageId: msg.id, from: msg.from, imageId: msg.image.id, text: msg.image.caption });
        } else if (msg.type && !["reaction", "ephemeral", "system"].includes(msg.type)) {
          // Reactions (👍 on our replies) and system events must stay silent;
          // real content types we can't read yet get a friendly fallback.
          out.push({ waMessageId: msg.id, from: msg.from, unsupported: msg.type });
        }
      }
    }
  }
  return out;
}

// Image formats Claude accepts; WhatsApp photos are JPEG/PNG in practice.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * Fetch a WhatsApp media object (two-step: metadata, then the file itself —
 * both require the bearer token). Returns null on any failure or oversize;
 * callers degrade gracefully rather than crash the turn.
 */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${config.whatsapp.apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url || !IMAGE_TYPES.has(meta.mime_type ?? "") || (meta.file_size ?? 0) > MAX_MEDIA_BYTES) {
      return null;
    }
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    });
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (buf.byteLength > MAX_MEDIA_BYTES) return null;
    return { base64: buf.toString("base64"), mediaType: meta.mime_type! };
  } catch (err) {
    console.error("[whatsapp] media download failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
