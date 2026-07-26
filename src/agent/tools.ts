import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { config } from "../config.js";
import { deleteUserData, searchPartnerCatalog } from "../db.js";
import {
  addMessage,
  addNote,
  addWishlistItem,
  activeGigsForFulfiller,
  createIntro,
  createLedgerEntry,
  createOffer,
  createTask,
  fmtMoney,
  getIntro,
  getLedgerByOffer,
  getOffer,
  getTask,
  getUserById,
  getWishlistItem,
  ProfilePatch,
  recentProposalCount,
  searchableMembers,
  setIntroStatus,
  setLedgerStatus,
  setMonthlyBudget,
  setOfferExpenses,
  setOfferStatus,
  setTaskStatus,
  setWishlistStatus,
  toCents,
  updateProfile,
  User,
} from "../db.js";

/** How the agent reaches members other than the one it's currently talking to. */
export type SendFn = (phone: string, text: string) => Promise<void>;

export interface ToolCtx {
  userId: number;
  agentName: string;
  sendTo: SendFn;
}

/** Send a message to another member AND record it in their transcript. */
async function notify(ctx: ToolCtx, target: User, text: string): Promise<void> {
  await addMessage(target.id, "out", text);
  await ctx.sendTo(target.phone, text);
}

const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

/**
 * Live prices straight from a Shopify storefront's public search endpoint —
 * exact current numbers (vs. search-snippet guesses) for the huge share of
 * DTC/boutique brands on Shopify. No auth; errors tell the model to fall
 * back to web search.
 */
export async function shopifyLivePrices(store: string, query: string): Promise<string> {
  const domain = store
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
  if (!domain.includes(".")) return JSON.stringify({ error: "invalid store domain" });
  const url = `https://${domain}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=6`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      return JSON.stringify({ error: `no Shopify endpoint at ${domain} — use web search instead` });
    }
    const data = (await res.json()) as {
      resources?: { results?: { products?: Array<Record<string, unknown>> } };
    };
    const prods = data.resources?.results?.products ?? [];
    if (prods.length === 0) {
      return JSON.stringify({ store: domain, found: [], note: "Shopify store answered but nothing matched — try different words or web search" });
    }
    const found = prods.slice(0, 6).map((p) => ({
      title: p.title,
      price: p.price ?? p.price_min ?? null,
      compare_at: p.compare_at_price_max ?? null,
      available: p.available ?? null,
      url: typeof p.url === "string" && p.url.startsWith("/") ? `https://${domain}${p.url}` : p.url,
    }));
    return JSON.stringify({ store: domain, live: true, currency_note: "prices in the store's own currency", found });
  } catch {
    return JSON.stringify({ error: `${domain} didn't answer in time — use web search instead` });
  }
}
const firstName = (u: User) => u.name?.split(" ")[0] ?? "a member";
const trunc = (s: string | null, n = 200): string | null => (s && s.length > n ? s.slice(0, n) + "…" : s);

// ---------------------------------------------------------------------------
// Implementations — plain functions so they can be tested without the LLM.
// Each returns a string that goes back to Claude as the tool result.
// All money amounts enter as dollars from the model, are stored as cents,
// and are echoed back formatted so the model never invents figures.
// ---------------------------------------------------------------------------

export const impls = {
  async update_profile(ctx: ToolCtx, input: ProfilePatch & { monthly_shopping_budget_dollars?: number }): Promise<string> {
    const { monthly_shopping_budget_dollars, ...patch } = input;
    let u = await updateProfile(ctx.userId, patch);
    if (typeof monthly_shopping_budget_dollars === "number" && monthly_shopping_budget_dollars >= 0) {
      await setMonthlyBudget(ctx.userId, toCents(monthly_shopping_budget_dollars));
      u = (await getUserById(ctx.userId))!;
    }
    return JSON.stringify({
      saved: true,
      profile: {
        name: u.name, role: u.role, location: u.location, bio: u.bio,
        skills: u.skills, offers: u.offers, needs: u.needs,
        earn_with: u.earn_with, area: u.area, availability: u.availability,
        monthly_shopping_budget: u.monthly_budget_cents != null ? fmtMoney(u.monthly_budget_cents) : null,
      },
    });
  },

  async add_wishlist_item(
    ctx: ToolCtx,
    input: { item: string; details?: string; price_ceiling_dollars?: number }
  ): Promise<string> {
    const w = await addWishlistItem(
      ctx.userId,
      input.item,
      input.details,
      input.price_ceiling_dollars != null ? toCents(input.price_ceiling_dollars) : undefined
    );
    return JSON.stringify({
      wishlist_id: w.id,
      item: w.item,
      price_ceiling: w.price_ceiling_cents != null ? fmtMoney(w.price_ceiling_cents) : null,
      status: "watching",
      note: "Saved. Deal-watching across merchant partners is not live yet — do NOT claim you found a deal or price. Say you've noted it and will flag matches once merchant deal-watching launches.",
    });
  },

  async update_wishlist_item(ctx: ToolCtx, input: { wishlist_id: number; status: "bought" | "dropped" }): Promise<string> {
    const w = await getWishlistItem(input.wishlist_id);
    if (!w || w.user_id !== ctx.userId) return JSON.stringify({ error: "wishlist item not found for this member" });
    await setWishlistStatus(w.id, input.status);
    return JSON.stringify({ wishlist_id: w.id, item: w.item, status: input.status });
  },

  async remember(ctx: ToolCtx, input: { note: string }): Promise<string> {
    await addNote(ctx.userId, input.note);
    return JSON.stringify({ saved: true });
  },

  async post_task(
    ctx: ToolCtx,
    input: {
      title: string;
      details?: string;
      category?: string;
      location?: string;
      fee_offer_dollars?: number;
      deadline?: string;
      needs_purchase?: boolean;
    }
  ): Promise<string> {
    const t = await createTask(ctx.userId, {
      title: input.title,
      details: input.details,
      category: input.category,
      location: input.location,
      fee_offer_cents: input.fee_offer_dollars != null ? toCents(input.fee_offer_dollars) : undefined,
      deadline: input.deadline,
      needs_purchase: input.needs_purchase,
    });
    return JSON.stringify({
      task_id: t.id,
      title: t.title,
      fee_offer: t.fee_offer_cents != null ? fmtMoney(t.fee_offer_cents) : null,
      needs_purchase: !!t.needs_purchase,
      status: t.status,
    });
  },

  async complete_task(ctx: ToolCtx, input: { task_id: number; outcome: "done" | "cancelled" }): Promise<string> {
    const t = await getTask(input.task_id);
    if (!t || t.user_id !== ctx.userId) return JSON.stringify({ error: "task not found for this member" });
    await setTaskStatus(t.id, input.outcome === "done" ? "completed" : "cancelled");
    return JSON.stringify({ task_id: t.id, status: input.outcome });
  },

  async search_network(ctx: ToolCtx, input: { query: string }): Promise<string> {
    const members = await searchableMembers(ctx.userId);
    if (members.length === 0) {
      return JSON.stringify({
        query: input.query,
        members: [],
        note: "The network has no other matchable members yet. Be honest, and ask the member to forward your contact to someone who could do this (they'd get paid for it).",
      });
    }
    return JSON.stringify({
      query: input.query,
      note: "Full member list — YOU rank fit: nearby (area)? willing (earn_with/skills)? available? Offer to at most 1-2 people. Identities stay private until an offer/intro is accepted.",
      members: members.map((m) => ({
        member_id: m.id,
        name: m.name,
        area: m.area,
        location: m.location,
        earn_with: trunc(m.earn_with),
        availability: trunc(m.availability),
        role: m.role,
        skills: trunc(m.skills),
        offers: trunc(m.offers),
        bio: trunc(m.bio, 150),
      })),
    });
  },

  // ---------------- gig dispatch: offered → accepted → delivered → confirmed → settled ----------------

  async offer_task(
    ctx: ToolCtx,
    input: { task_id: number; fulfiller_member_id: number; fee_dollars: number; message_to_fulfiller: string }
  ): Promise<string> {
    const task = await getTask(input.task_id);
    if (!task || task.user_id !== ctx.userId) return JSON.stringify({ error: "task not found for this member" });
    if (task.status !== "open") return JSON.stringify({ error: `task is ${task.status}, not open` });

    const fulfiller = await getUserById(input.fulfiller_member_id);
    if (!fulfiller) return JSON.stringify({ error: "member not found" });
    if (fulfiller.id === ctx.userId) return JSON.stringify({ error: "cannot offer a member their own task" });
    if (fulfiller.opted_out) return JSON.stringify({ error: "member has opted out of messages" });
    if ((await recentProposalCount(fulfiller.id)) >= 3) {
      return JSON.stringify({ error: "member has received too many uninvited offers this week (fatigue cap). Pick someone else." });
    }
    if (!(input.fee_dollars > 0)) return JSON.stringify({ error: "fee_dollars must be positive" });

    const offer = await createOffer(task.id, ctx.userId, fulfiller.id, toCents(input.fee_dollars), input.message_to_fulfiller);
    await notify(ctx, fulfiller, input.message_to_fulfiller);
    return JSON.stringify({
      offer_id: offer.id,
      fee: fmtMoney(offer.fee_cents),
      status: "offered",
      note: "Candidate messaged. Tell the requester you're on it — do NOT name the person until they accept.",
    });
  },

  async accept_offer(ctx: ToolCtx, input: { offer_id: number }): Promise<string> {
    const offer = await getOffer(input.offer_id);
    if (!offer || offer.fulfiller_id !== ctx.userId) return JSON.stringify({ error: "no such pending offer for this member" });
    if (offer.status !== "offered") return JSON.stringify({ error: `offer is already ${offer.status}` });

    const requester = (await getUserById(offer.requester_id))!;
    const fulfiller = (await getUserById(offer.fulfiller_id))!;
    const task = (await getTask(offer.task_id))!;

    await setOfferStatus(offer.id, "accepted");
    await setTaskStatus(task.id, "assigned");

    await notify(
      ctx,
      requester,
      `🎉 Your task is taken! *${fulfiller.name}* (${fulfiller.area ?? fulfiller.location ?? "nearby"}) is on "${task.title}" for ${fmtMoney(offer.fee_cents)}${task.needs_purchase ? " + cost of the purchase (receipt at the end)" : ""}.\nWhatsApp them the details: ${waLink(fulfiller.phone)}\nI'll handle the money math when it's done.`
    );

    return JSON.stringify({
      offer_id: offer.id,
      status: "accepted",
      fee: fmtMoney(offer.fee_cents),
      requester_contact_card: `${requester.name} — ${waLink(requester.phone)}`,
      note: `Both sides are connected now. In your reply, give the member the requester's contact card and tell them to coordinate specifics (list, address, timing) directly. When they've done the job, they tell you and you call mark_delivered.`,
    });
  },

  async decline_offer(ctx: ToolCtx, input: { offer_id: number; reason?: string }): Promise<string> {
    const offer = await getOffer(input.offer_id);
    if (!offer || offer.fulfiller_id !== ctx.userId) return JSON.stringify({ error: "no such pending offer for this member" });
    if (offer.status !== "offered") return JSON.stringify({ error: `offer is already ${offer.status}` });

    await setOfferStatus(offer.id, "declined");
    if (input.reason) await addNote(ctx.userId, `Declined offer #${offer.id}: ${input.reason}`);
    const requester = await getUserById(offer.requester_id);
    const task = await getTask(offer.task_id);
    if (requester && !requester.opted_out) {
      await notify(
        ctx,
        requester,
        `Update on "${task?.title ?? "your task"}": first person I tried can't do it right now — still looking. Know someone who'd want to earn ${offer.fee_cents ? fmtMoney(offer.fee_cents) : "this"}? Forward them my contact.`
      );
    }
    return JSON.stringify({ offer_id: offer.id, status: "declined", note: "Requester notified you're still looking (no identity revealed). Thank the member warmly." });
  },

  async mark_delivered(
    ctx: ToolCtx,
    input: { offer_id: number; expenses_dollars?: number; expense_note?: string }
  ): Promise<string> {
    const offer = await getOffer(input.offer_id);
    if (!offer || offer.fulfiller_id !== ctx.userId) return JSON.stringify({ error: "no such active gig for this member" });
    if (offer.status !== "accepted") return JSON.stringify({ error: `offer is ${offer.status}; only accepted gigs can be delivered` });

    const expensesCents = input.expenses_dollars != null ? toCents(input.expenses_dollars) : 0;
    await setOfferExpenses(offer.id, expensesCents, input.expense_note ?? null);
    await setOfferStatus(offer.id, "delivered");

    const requester = (await getUserById(offer.requester_id))!;
    const fulfiller = (await getUserById(offer.fulfiller_id))!;
    const task = (await getTask(offer.task_id))!;
    const total = offer.fee_cents + expensesCents;

    await notify(
      ctx,
      requester,
      `*${firstName(fulfiller)}* says "${task.title}" is done ✅\n` +
        (expensesCents > 0
          ? `Cost breakdown: ${fmtMoney(expensesCents)} expenses (${input.expense_note ?? "receipt"}) + ${fmtMoney(offer.fee_cents)} fee = *${fmtMoney(total)}*.\n`
          : `Fee: *${fmtMoney(offer.fee_cents)}*.\n`) +
        `All good? Reply "confirm" and I'll set up the payment.`
    );

    return JSON.stringify({
      offer_id: offer.id,
      status: "delivered",
      total_due: fmtMoney(total),
      note: "Requester asked to confirm. Tell the member the requester has been pinged and payment comes next.",
    });
  },

  async confirm_completed(ctx: ToolCtx, input: { offer_id: number }): Promise<string> {
    const offer = await getOffer(input.offer_id);
    if (!offer || offer.requester_id !== ctx.userId) return JSON.stringify({ error: "no such delivered gig for this member" });
    if (offer.status !== "delivered") return JSON.stringify({ error: `offer is ${offer.status}; only delivered gigs can be confirmed` });

    const fulfiller = (await getUserById(offer.fulfiller_id))!;
    const task = (await getTask(offer.task_id))!;
    const total = offer.fee_cents + offer.expenses_cents;

    await setOfferStatus(offer.id, "confirmed");
    await setTaskStatus(task.id, "completed");
    const entry = await createLedgerEntry(offer.id, offer.requester_id, offer.fulfiller_id, total);

    await notify(
      ctx,
      fulfiller,
      `Confirmed by the requester 🙌 You're owed *${fmtMoney(total)}* for "${task.title}". They're sending it by Interac e-Transfer to your number now — tell me when it lands.`
    );

    return JSON.stringify({
      offer_id: offer.id,
      ledger_id: entry.id,
      status: "confirmed",
      amount_due: fmtMoney(total),
      pay_to: `${fulfiller.name} — Interac e-Transfer to +${fulfiller.phone}`,
      note: "Give the member exact payment instructions (amount + e-Transfer to the fulfiller's phone number). When they say they've sent it, call record_payment_sent.",
    });
  },

  async record_payment_sent(ctx: ToolCtx, input: { offer_id: number }): Promise<string> {
    const offer = await getOffer(input.offer_id);
    if (!offer || offer.requester_id !== ctx.userId) return JSON.stringify({ error: "no such gig for this member" });
    const entry = await getLedgerByOffer(offer.id);
    if (!entry || entry.status !== "due") return JSON.stringify({ error: "no payment currently due on this gig" });

    await setLedgerStatus(entry.id, "payer_sent");
    const fulfiller = (await getUserById(offer.fulfiller_id))!;
    await notify(ctx, fulfiller, `Payment of *${fmtMoney(entry.amount_cents)}* is on its way to you. Reply "got it" once it arrives and I'll close this out.`);
    return JSON.stringify({ status: "payer_sent", note: "Fulfiller asked to confirm receipt. Thank the member." });
  },

  async confirm_payment_received(ctx: ToolCtx, input: { offer_id: number }): Promise<string> {
    const offer = await getOffer(input.offer_id);
    if (!offer || offer.fulfiller_id !== ctx.userId) return JSON.stringify({ error: "no such gig for this member" });
    const entry = await getLedgerByOffer(offer.id);
    if (!entry || entry.status === "settled") return JSON.stringify({ error: "nothing awaiting settlement on this gig" });

    await setLedgerStatus(entry.id, "settled");
    await setOfferStatus(offer.id, "settled");
    const requester = (await getUserById(offer.requester_id))!;
    const task = (await getTask(offer.task_id))!;
    await notify(ctx, requester, `All settled — "${task.title}" is complete and paid. 🎉 How was the experience? And anytime you want to *earn* too, just say the word.`);
    return JSON.stringify({
      status: "settled",
      earned: fmtMoney(entry.amount_cents),
      note: "Gig fully settled. Congratulate the member on earning; ask how it went (store feedback with remember).",
    });
  },

  // ---------------- superconnector intros (kept from the original loop) ----------------

  async propose_intro(
    ctx: ToolCtx,
    input: { task_id: number; candidate_member_id: number; message_to_candidate: string }
  ): Promise<string> {
    const task = await getTask(input.task_id);
    if (!task || task.user_id !== ctx.userId) return JSON.stringify({ error: "task not found for this member" });
    if (task.status !== "open") return JSON.stringify({ error: `task is ${task.status}, not open` });

    const candidate = await getUserById(input.candidate_member_id);
    if (!candidate) return JSON.stringify({ error: "candidate not found" });
    if (candidate.id === ctx.userId) return JSON.stringify({ error: "cannot introduce a member to themselves" });
    if (candidate.opted_out) return JSON.stringify({ error: "candidate has opted out of messages" });
    if ((await recentProposalCount(candidate.id)) >= 3) {
      return JSON.stringify({ error: "candidate has received too many proposals this week (fatigue cap). Pick someone else or wait." });
    }

    const intro = await createIntro(task.id, ctx.userId, candidate.id, input.message_to_candidate);
    await notify(ctx, candidate, input.message_to_candidate);
    return JSON.stringify({
      intro_id: intro.id,
      status: "proposed",
      note: "Candidate messaged. Tell the requester you've reached out to someone promising — WITHOUT revealing who.",
    });
  },

  async accept_intro(ctx: ToolCtx, input: { intro_id: number }): Promise<string> {
    const intro = await getIntro(input.intro_id);
    if (!intro || intro.candidate_id !== ctx.userId) return JSON.stringify({ error: "no such pending intro for this member" });
    if (intro.status !== "proposed") return JSON.stringify({ error: `intro is already ${intro.status}` });

    const requester = (await getUserById(intro.requester_id))!;
    const candidate = (await getUserById(intro.candidate_id))!;
    const task = await getTask(intro.task_id);

    await setIntroStatus(intro.id, "accepted");
    await notify(
      ctx,
      requester,
      `Good news — the person I had in mind said yes! 🎉\n\nMeet *${candidate.name}* (${candidate.role ?? "member"}${candidate.location ? ", " + candidate.location : ""}).\nWhatsApp: ${waLink(candidate.phone)}\n\nRe: ${task?.title ?? "your ask"}. I told them you'd reach out — go say hi!`
    );
    await setIntroStatus(intro.id, "connected");
    if (task) await setTaskStatus(task.id, "matched");

    return JSON.stringify({
      intro_id: intro.id,
      status: "connected",
      reply_to_current_member: `You're connected! Here's *${requester.name}*${requester.role ? " (" + requester.role + ")" : ""}.\nWhatsApp: ${waLink(requester.phone)}\n\nThey'll probably message you first. Thanks for being open to it 🙌`,
      note: "Both sides connected. Relay reply_to_current_member in your reply.",
    });
  },

  async decline_intro(ctx: ToolCtx, input: { intro_id: number; reason?: string }): Promise<string> {
    const intro = await getIntro(input.intro_id);
    if (!intro || intro.candidate_id !== ctx.userId) return JSON.stringify({ error: "no such pending intro for this member" });
    if (intro.status !== "proposed") return JSON.stringify({ error: `intro is already ${intro.status}` });

    await setIntroStatus(intro.id, "declined");
    if (input.reason) await addNote(ctx.userId, `Declined intro #${intro.id}: ${input.reason}`);
    const requester = await getUserById(intro.requester_id);
    if (requester && !requester.opted_out) {
      const introTask = await getTask(intro.task_id);
      await notify(
        ctx,
        requester,
        `Quick update on "${introTask?.title ?? "your ask"}" — the first person I tried isn't available. Still looking. Know someone great? Forward them my contact!`
      );
    }
    return JSON.stringify({ intro_id: intro.id, status: "declined", note: "Requester notified (no identity revealed). Thank the member warmly." });
  },
};

// ---------------------------------------------------------------------------
// Tool definitions handed to the Claude tool runner.
// ---------------------------------------------------------------------------

export function buildTools(ctx: ToolCtx) {
  // Phase 1 (shopping copilot) tools — always on.
  const core = [
    betaTool({
      name: "delete_my_data",
      description:
        "PERMANENTLY erase everything stored about this member: messages, wishlist, notes, profile, phone number. Call ONLY after the member explicitly asked for deletion AND confirmed with a clear yes in this conversation. Irreversible. After it returns, send one short goodbye — their history is already gone.",
      inputSchema: {
        type: "object" as const,
        properties: {
          confirmed: {
            type: "boolean",
            description: "true only if the member explicitly confirmed full deletion this conversation",
          },
        },
        required: ["confirmed"],
        additionalProperties: false,
      },
      run: async (input) => {
        if (!(input as { confirmed: boolean }).confirmed) {
          return "NOT deleted — ask the member to explicitly confirm full, irreversible deletion first.";
        }
        await deleteUserData(ctx.userId);
        return "Done: all member data erased (messages, wishlist, profile, phone). Send a brief goodbye; do not store anything new.";
      },
    }),

    betaTool({
      name: "search_partner_catalog",
      description:
        "Search the live catalogs of SuperX partner stores (Shopify merchants who installed our app — prices and stock updated in real time by the stores themselves). ALWAYS check this first for any product hunt: exact prices, exact product links, per-size/variant availability. Empty results just mean no partner carries it — fall through to shopify_live_prices/web search. Label these results as partner stores in your reply, and stay willing to say a partner is overpriced vs elsewhere.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Product words, e.g. 'men running shoes'" },
          size: { type: "string", description: "Optional size/variant filter, e.g. '11' or 'XL'" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      run: async (input) => {
        const { query, size } = input as { query: string; size?: string };
        const hits = await searchPartnerCatalog(query, size);
        if (hits.length === 0) return JSON.stringify({ partner_results: [], note: "no partner store carries this — use shopify_live_prices or web search" });
        return JSON.stringify({
          partner_results: hits.map((h) => ({
            store: h.shop_domain.replace(".myshopify.com", ""),
            title: h.title,
            variant: h.variant_title,
            price: fmtMoney(h.price_cents),
            was: h.compare_at_cents != null ? fmtMoney(h.compare_at_cents) : null,
            in_stock: h.available,
            url: `https://${h.shop_domain}/products/${h.handle}?variant=${h.variant_id}`,
          })),
          note: "live partner data — exact prices/stock, links go straight to the product",
        });
      },
    }),

    betaTool({
      name: "shopify_live_prices",
      description:
        "Exact LIVE prices from any Shopify-powered store (most DTC/boutique brands, incl. many Canadian retailers). Try this FIRST whenever the member names or links a specific store — it beats search snippets. If it errors, fall back to web_fetch/web_search. Prices are the store's public prices.",
      inputSchema: {
        type: "object" as const,
        properties: {
          store: { type: "string", description: "Store domain or any URL from it, e.g. 'knix.ca' or a product link" },
          query: { type: "string", description: "Product words to search, e.g. 'baggy jean dark grey'" },
        },
        required: ["store", "query"],
        additionalProperties: false,
      },
      run: (input) => shopifyLivePrices((input as { store: string }).store, (input as { query: string }).query),
    }),

    betaTool({
      name: "update_profile",
      description:
        "Save facts about the member as soon as you learn them. Call incrementally. earn_with/area/availability power gig dispatch; skills/offers/needs power professional matching.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Full name" },
          role: { type: "string", description: "What they do, e.g. 'student', 'ML engineer'" },
          location: { type: "string", description: "City" },
          area: { type: "string", description: "Neighbourhood-level area for gigs, e.g. 'Annex, Toronto'" },
          earn_with: { type: "string", description: "What they'd do to earn: 'grocery runs, deliveries, tutoring math'" },
          availability: { type: "string", description: "When they can take gigs: 'weekday evenings, weekends'" },
          bio: { type: "string", description: "1-3 sentence summary" },
          skills: { type: "string", description: "Comma-separated skills" },
          offers: { type: "string", description: "What they can offer other members professionally" },
          needs: { type: "string", description: "What they're currently looking for" },
          monthly_shopping_budget_dollars: {
            type: "number",
            description: "Self-declared monthly spending budget for wants (member tells you; NEVER ask for bank details or income documents)",
          },
        },
        additionalProperties: false,
      },
      run: (input) => impls.update_profile(ctx, input as ProfilePatch & { monthly_shopping_budget_dollars?: number }),
    }),

    betaTool({
      name: "add_wishlist_item",
      description:
        "Save a product/thing the member wants someday ('been wanting a mechanical keyboard'). Capture their max price if offered. The network will watch merchant deals for matches as that launches — never invent a deal.",
      inputSchema: {
        type: "object" as const,
        properties: {
          item: { type: "string", description: "The item, specific as possible, e.g. 'Keychron K8 mechanical keyboard'" },
          details: { type: "string", description: "Specs, brand, size, colour preferences" },
          price_ceiling_dollars: { type: "number", description: "Max they'd pay" },
        },
        required: ["item"],
        additionalProperties: false,
      },
      run: (input) => impls.add_wishlist_item(ctx, input as { item: string; details?: string; price_ceiling_dollars?: number }),
    }),

    betaTool({
      name: "update_wishlist_item",
      description: "Mark a wishlist item bought or dropped when the member says they got it or no longer want it.",
      inputSchema: {
        type: "object" as const,
        properties: {
          wishlist_id: { type: "integer" },
          status: { type: "string", enum: ["bought", "dropped"] },
        },
        required: ["wishlist_id", "status"],
        additionalProperties: false,
      },
      run: (input) => impls.update_wishlist_item(ctx, input as { wishlist_id: number; status: "bought" | "dropped" }),
    }),

    betaTool({
      name: "remember",
      description: "Store a durable note about this member (preferences, context, feedback on completed gigs).",
      inputSchema: {
        type: "object" as const,
        properties: { note: { type: "string" } },
        required: ["note"],
        additionalProperties: false,
      },
      run: (input) => impls.remember(ctx, input as { note: string }),
    }),
  ];

  // Phase 2 (gig economy + intros) tools — behind ENABLE_GIGS.
  const gigsAndIntros = [
    betaTool({
      name: "post_task",
      description:
        "Record something the member needs done or found ('groceries', 'find a designer'). Capture the fee they'll pay for gig-type tasks. Call the moment a real need surfaces, then search_network.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Short summary, e.g. 'Grocery run from Metro'" },
          details: { type: "string", description: "Specifics: items, timing, constraints" },
          category: {
            type: "string",
            enum: ["errand", "delivery", "food", "housing", "transport", "service", "tutoring", "hire", "intro", "advice", "other"],
          },
          location: { type: "string", description: "Where the task happens" },
          fee_offer_dollars: { type: "number", description: "What the member will pay the person who does it (their labour fee, NOT purchase costs)" },
          deadline: { type: "string", description: "When it's needed, e.g. 'today 6pm'" },
          needs_purchase: { type: "boolean", description: "true if the fulfiller fronts money for goods (groceries etc.) to be reimbursed on receipt" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      run: (input) =>
        impls.post_task(
          ctx,
          input as { title: string; details?: string; category?: string; location?: string; fee_offer_dollars?: number; deadline?: string; needs_purchase?: boolean }
        ),
    }),

    betaTool({
      name: "complete_task",
      description: "Mark the member's own task done or cancelled when they say it's handled or no longer needed (outside the paid-gig flow).",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_id: { type: "integer" },
          outcome: { type: "string", enum: ["done", "cancelled"] },
        },
        required: ["task_id", "outcome"],
        additionalProperties: false,
      },
      run: (input) => impls.complete_task(ctx, input as { task_id: number; outcome: "done" | "cancelled" }),
    }),

    betaTool({
      name: "search_network",
      description:
        "List members so YOU can pick who fits a task: nearby (area), willing (earn_with/skills), available. Call right after post_task. Results are private until an offer/intro is accepted.",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", description: "What kind of person/help is needed, incl. where and when" } },
        required: ["query"],
        additionalProperties: false,
      },
      run: (input) => impls.search_network(ctx, input as { query: string }),
    }),

    betaTool({
      name: "offer_task",
      description:
        "Offer a PAID gig to a member (they earn the fee). Sends your pitch with the fee; they reply yes/no. Use for errands/deliveries/services. For unpaid professional connections use propose_intro instead.",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_id: { type: "integer" },
          fulfiller_member_id: { type: "integer", description: "member_id from search_network" },
          fee_dollars: { type: "number", description: "The fee they earn (from the task's fee_offer unless renegotiated)" },
          message_to_fulfiller: {
            type: "string",
            description:
              "The WhatsApp pitch they receive: what the job is, where, when, the fee (and that purchases are reimbursed on receipt if applicable), ending with asking if they want it — reply yes or no.",
          },
        },
        required: ["task_id", "fulfiller_member_id", "fee_dollars", "message_to_fulfiller"],
        additionalProperties: false,
      },
      run: (input) =>
        impls.offer_task(ctx, input as { task_id: number; fulfiller_member_id: number; fee_dollars: number; message_to_fulfiller: string }),
    }),

    betaTool({
      name: "accept_offer",
      description:
        "The member you're talking to is the FULFILLER of a pending gig offer (see current_state) and said yes. Connects both sides so they can coordinate details directly.",
      inputSchema: {
        type: "object" as const,
        properties: { offer_id: { type: "integer" } },
        required: ["offer_id"],
        additionalProperties: false,
      },
      run: (input) => impls.accept_offer(ctx, input as { offer_id: number }),
    }),

    betaTool({
      name: "decline_offer",
      description: "The member is the FULFILLER of a pending gig offer and said no. Declines gracefully; requester told you're still looking.",
      inputSchema: {
        type: "object" as const,
        properties: {
          offer_id: { type: "integer" },
          reason: { type: "string", description: "Optional reason, stored to improve future dispatch" },
        },
        required: ["offer_id"],
        additionalProperties: false,
      },
      run: (input) => impls.decline_offer(ctx, input as { offer_id: number; reason?: string }),
    }),

    betaTool({
      name: "mark_delivered",
      description:
        "The member (FULFILLER) says the gig is done. Record any money they fronted for purchases (from their receipt) so the total can be computed. Notifies the requester to confirm.",
      inputSchema: {
        type: "object" as const,
        properties: {
          offer_id: { type: "integer" },
          expenses_dollars: { type: "number", description: "Receipt total they fronted for goods (0 if none). Ask for the exact receipt amount." },
          expense_note: { type: "string", description: "e.g. 'Metro receipt'" },
        },
        required: ["offer_id"],
        additionalProperties: false,
      },
      run: (input) => impls.mark_delivered(ctx, input as { offer_id: number; expenses_dollars?: number; expense_note?: string }),
    }),

    betaTool({
      name: "confirm_completed",
      description:
        "The member (REQUESTER) confirms the delivered gig is good. Creates the amount owed and gives you exact payment instructions to relay (e-Transfer between members — you never hold money).",
      inputSchema: {
        type: "object" as const,
        properties: { offer_id: { type: "integer" } },
        required: ["offer_id"],
        additionalProperties: false,
      },
      run: (input) => impls.confirm_completed(ctx, input as { offer_id: number }),
    }),

    betaTool({
      name: "record_payment_sent",
      description: "The member (REQUESTER) says they've sent the payment. Fulfiller is asked to confirm it arrived.",
      inputSchema: {
        type: "object" as const,
        properties: { offer_id: { type: "integer" } },
        required: ["offer_id"],
        additionalProperties: false,
      },
      run: (input) => impls.record_payment_sent(ctx, input as { offer_id: number }),
    }),

    betaTool({
      name: "confirm_payment_received",
      description: "The member (FULFILLER) confirms the money arrived. Settles the gig completely.",
      inputSchema: {
        type: "object" as const,
        properties: { offer_id: { type: "integer" } },
        required: ["offer_id"],
        additionalProperties: false,
      },
      run: (input) => impls.confirm_payment_received(ctx, input as { offer_id: number }),
    }),

    betaTool({
      name: "propose_intro",
      description:
        "Start a double-opt-in professional INTRO (no payment): asks the candidate if they're open to connecting with the requester. Candidate stays anonymous to the requester until they accept.",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_id: { type: "integer" },
          candidate_member_id: { type: "integer" },
          message_to_candidate: {
            type: "string",
            description: "Warm, specific pitch of the requester's need (requester may be named), ending with asking if they're open — reply yes or no.",
          },
        },
        required: ["task_id", "candidate_member_id", "message_to_candidate"],
        additionalProperties: false,
      },
      run: (input) =>
        impls.propose_intro(ctx, input as { task_id: number; candidate_member_id: number; message_to_candidate: string }),
    }),

    betaTool({
      name: "accept_intro",
      description:
        "The member is the CANDIDATE of a pending intro and said yes. Connects both sides and shares contacts. Include the returned reply_to_current_member content in your reply.",
      inputSchema: {
        type: "object" as const,
        properties: { intro_id: { type: "integer" } },
        required: ["intro_id"],
        additionalProperties: false,
      },
      run: (input) => impls.accept_intro(ctx, input as { intro_id: number }),
    }),

    betaTool({
      name: "decline_intro",
      description: "The member is the CANDIDATE of a pending intro and said no. Declines gracefully without revealing anyone.",
      inputSchema: {
        type: "object" as const,
        properties: {
          intro_id: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["intro_id"],
        additionalProperties: false,
      },
      run: (input) => impls.decline_intro(ctx, input as { intro_id: number; reason?: string }),
    }),
  ];

  return config.enableGigs ? [...core, ...gigsAndIntros] : core;
}
