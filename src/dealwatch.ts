/**
 * Wishlist deal-watcher — deliberately cheap:
 *  - Haiku (config.dealWatch.model) instead of the Opus conversation brain
 *  - all of a user's due items batched into ONE search-enabled call
 *  - each item checked at most once per itemIntervalHours
 *  - ping text composed in code (zero LLM tokens for notifications)
 *  - pings only on real hits (<= ceiling, or clear discount when no ceiling),
 *    and only when the price beats the last alerted price
 */
import { Anthropic } from "@anthropic-ai/sdk";
import { config } from "./config.js";
import {
  addMessage,
  fmtMoney,
  getUserById,
  recordDealAlert,
  recordDealCheck,
  toCents,
  User,
  WishlistItem,
  wishlistDueForCheck,
} from "./db.js";
import { SendFn } from "./agent/tools.js";
import { sendWhatsAppTemplate } from "./channels/whatsapp.js";

let _client: Anthropic | null = null;
const getClient = () => (_client ??= new Anthropic());

interface CheckResult {
  wishlist_id: number;
  found: boolean;
  best_price: number | null; // dollars CAD
  store: string | null;
  url: string | null;
  note: string;
  is_deal: boolean;
}

const CHECKER_PROMPT = `You are a background price-checking service for a shopping assistant. For EACH watchlist item the user message lists, run a quick web search for the current best price in CAD from reputable Canadian retailers (or retailers shipping to Canada). Be efficient — at most 1-2 searches per item.

Reply with ONLY a JSON array (no prose, no code fences), one object per item:
{"wishlist_id": <number>, "found": <bool>, "best_price": <number or null, CAD>, "store": <string or null>, "url": <string or null>, "note": "<=100 chars>", "is_deal": <bool>}

is_deal is true ONLY if: price is at/below the item's max_price (when given), OR — when no max_price — the price is a clear, significant discount (roughly 15%+ below the typical/regular price you can verify). Be conservative. Never invent prices: if unsure, found=false.`;

function parseResults(text: string): CheckResult[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? (arr as CheckResult[]) : [];
  } catch {
    return [];
  }
}

async function checkItemsForUser(items: WishlistItem[]): Promise<CheckResult[]> {
  const payload = items.map((w) => ({
    wishlist_id: w.id,
    item: w.item,
    details: w.details,
    max_price: w.price_ceiling_cents != null ? w.price_ceiling_cents / 100 : null,
  }));

  // content is string on the first turn and a content-block array on
  // pause_turn continuations; typed loosely to stay resolution-agnostic.
  let messages: { role: "user" | "assistant"; content: any }[] = [
    { role: "user", content: JSON.stringify(payload) },
  ];
  let response = await getClient().messages.create({
    model: config.dealWatch.model,
    max_tokens: 1500,
    system: CHECKER_PROMPT,
    messages,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: Math.min(items.length * 2, 8), blocked_domains: ["walmart.com","bestbuy.com","target.com","costco.com","amazon.com","homedepot.com","lowes.com","ebay.com","samsclub.com","newegg.com"] }],
  });

  // Server-tool loops can pause; continue up to twice.
  for (let i = 0; i < 2 && response.stop_reason === "pause_turn"; i++) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await getClient().messages.create({
      model: config.dealWatch.model,
      max_tokens: 1500,
      system: CHECKER_PROMPT,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: Math.min(items.length * 2, 8), blocked_domains: ["walmart.com","bestbuy.com","target.com","costco.com","amazon.com","homedepot.com","lowes.com","ebay.com","samsclub.com","newegg.com"] }],
    });
  }

  const text = response.content
    .filter((b: { type: string; text?: string }) => b.type === "text")
    .map((b: { type: string; text?: string }) => b.text ?? "")
    .join("");
  return parseResults(text);
}

function composePing(item: WishlistItem, r: CheckResult): string {
  const price = fmtMoney(toCents(r.best_price!));
  const where = r.store ? ` at ${r.store}` : "";
  const target =
    item.price_ceiling_cents != null ? ` — that's at or under your ${fmtMoney(item.price_ceiling_cents)} target` : "";
  const link = r.url ? `\n${r.url}` : "";
  return `🔔 Deal spotted: *${item.item}* — ${price} CAD${where}${target}.${link}\n\nReply "bought" if you grab it, or "stop watching" and I'll drop it.`;
}

export interface DealWatchSummary {
  checked: number;
  pinged: number;
  stored: number; // deals found but ping blocked (e.g. outside 24h window)
  errors: number;
}

export async function runDealWatch(sendTo: SendFn): Promise<DealWatchSummary> {
  const summary: DealWatchSummary = { checked: 0, pinged: 0, stored: 0, errors: 0 };
  const due = await wishlistDueForCheck(config.dealWatch.itemIntervalHours, config.dealWatch.maxItemsPerRun);
  if (due.length === 0) return summary;

  const byUser = new Map<number, WishlistItem[]>();
  for (const w of due) {
    (byUser.get(w.user_id) ?? byUser.set(w.user_id, []).get(w.user_id)!).push(w);
  }

  for (const [userId, items] of byUser) {
    const user: User | undefined = await getUserById(userId);
    if (!user || user.opted_out) continue;

    let results: CheckResult[] = [];
    try {
      results = await checkItemsForUser(items);
    } catch (err) {
      console.error(`[dealwatch] check failed for user ${userId}:`, err);
      summary.errors++;
      continue;
    }

    for (const item of items) {
      const r = results.find((x) => x.wishlist_id === item.id);
      summary.checked++;
      if (!r || !r.found || r.best_price == null) {
        await recordDealCheck(item.id, null, r?.note ?? null);
        continue;
      }
      const priceCents = toCents(r.best_price);
      await recordDealCheck(item.id, priceCents, [r.store, r.note].filter(Boolean).join(" — ") || null);

      const underCeiling = item.price_ceiling_cents != null && priceCents <= item.price_ceiling_cents;
      const isHit = underCeiling || (item.price_ceiling_cents == null && r.is_deal);
      const beatsLastAlert = item.alerted_price_cents == null || priceCents < item.alerted_price_cents;
      if (!isHit || !beatsLastAlert) continue;

      const ping = composePing(item, r);
      try {
        await addMessage(user.id, "out", ping);
        await sendTo(user.phone, ping);
        await recordDealAlert(item.id, priceCents);
        summary.pinged++;
      } catch (err) {
        // Free-form blocked — almost always the closed 24h service window.
        // Fall back to the approved utility template; a reply re-opens the
        // window and Shoppy then shares the link/details.
        console.error(`[dealwatch] ping blocked for ${user.phone}:`, err instanceof Error ? err.message : err);
        try {
          const param = `${item.item} — ${fmtMoney(priceCents)} CAD${r.store ? ` at ${r.store}` : ""}`;
          await sendWhatsAppTemplate(
            user.phone,
            config.dealWatch.templateName,
            config.dealWatch.templateLang,
            [param.slice(0, 400)]
          );
          await recordDealAlert(item.id, priceCents);
          summary.pinged++;
        } catch (tplErr) {
          // Template also failed (not yet approved / wrong lang code) — deal
          // stays stored on the item and surfaces next time the member texts.
          console.error(`[dealwatch] template fallback failed for ${user.phone}:`, tplErr instanceof Error ? tplErr.message : tplErr);
          summary.stored++;
        }
      }
    }
  }
  return summary;
}
