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

export interface IncomingText {
  waMessageId: string;
  from: string; // sender phone in international format, no '+'
  text: string;
}

/** Pull text messages out of a Cloud API webhook payload. */
export function extractIncoming(body: unknown): IncomingText[] {
  const out: IncomingText[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: unknown[] }[]) {
    for (const change of (entry.changes ?? []) as { value?: { messages?: unknown[] } }[]) {
      for (const msg of (change.value?.messages ?? []) as {
        id?: string;
        from?: string;
        type?: string;
        text?: { body?: string };
      }[]) {
        if (msg.type === "text" && msg.id && msg.from && msg.text?.body) {
          out.push({ waMessageId: msg.id, from: msg.from, text: msg.text.body });
        }
      }
    }
  }
  return out;
}
