# SuperX Launch Runbook

State right now: **DEPLOYED AND LIVE** — Vercel serverless (compute) + Supabase Postgres (data, isolated `superx` schema), webhook on the production URL, agent answering with full history. **The remaining launch gate is the Meta production number (Step 2): the TEST number only talks to 5 verified people, so a LinkedIn post before Step 2 completes would send strangers to a number that ignores them.**

---

## Step 1 — Deploy ✅ DONE (Vercel + Supabase, $0 marginal on existing plans)

Current architecture, for reference:

| Piece | Where | Notes |
|---|---|---|
| Compute | Vercel project `superx` → `https://superx-ten.vercel.app` | `/api/webhook` (Meta), `/api/health`, `/api/cron-dealwatch` (daily 10:00 Toronto), root `/` redirects into the WhatsApp chat |
| Data | Supabase Postgres, **schema `superx`** (own role `superx_app`; Rivera untouched in `public`) | Browse: Table Editor → **schema dropdown (top-left) → `superx`** — it defaults to `public`, which is why the tables "look missing" |
| Repo | github.com/Mohit1298/superx (private) | Push to `main` = auto-deploy |
| Env/config | Vercel → superx → Settings → Environment Variables (change → **Redeploy** to apply) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `MAX_USER_MSGS_PER_DAY`, `CRON_SECRET`, `WA_LINK_NUMBER` |
| Logs | Vercel → superx → Logs (live function output, errors) | |
| Kill switch | Set `MAX_USER_MSGS_PER_DAY=0` + Redeploy, or pause the project | |

Ops notes: Vercel Hobby limits crons to daily (fine — items are checked per-24h anyway) and the Anthropic long turns fit in the function window. The laptop has zero role.

## Step 2 — Meta production (the launch gate — start TODAY, has waiting periods)

**2a. Permanent token (15 min, removes the daily breakage forever):**
[business.facebook.com](https://business.facebook.com) → Settings → Users → **System Users** → Add (`superx-server`, Admin) → Add Assets → your app (full control) → **Generate Token** → expiry **Never**, scopes `whatsapp_business_messaging` + `whatsapp_business_management` → paste into Vercel env (`WHATSAPP_TOKEN`) → Redeploy.

**2b. Real phone number (1–2 days):**
- Get a number that has never been on WhatsApp (cheapest: a prepaid SIM/eSIM; a landline you can receive a verification call on also works).
- Meta app → WhatsApp → API Setup → **Add phone number** → verify → set display name **SuperX** (name goes through a short review).
- Update `WHATSAPP_PHONE_NUMBER_ID` **and** `WA_LINK_NUMBER` in Vercel env → Redeploy. This number is what goes in every marketing asset — it can message ANYONE who texts it first. Unverified businesses start with a cap on *business-initiated* conversations (~250/day) — fine, because your growth is user-initiated (unlimited).
- ⚠️ Deal-watch pings to users who haven't texted in 24h count as business-initiated and eventually need an approved **template**. Until the template is approved, blocked pings are stored and surfaced next chat (already built). Create the template early: WhatsApp Manager → Message templates → e.g. `deal_alert` "🔔 A wishlist item just hit your target price: {{1}}. Reply for details." → submit for review.

**2c. Business verification (days–weeks — start now, don't block launch on it):**
Business Settings → Security Centre → Start verification. Needs a legal business — an Ontario sole proprietorship registration (~$60, same-day online) is the lightweight path. Verification lifts messaging tiers (1K → 10K → 100K/day) and looks legit in chat. You can launch unverified; verify in parallel.

## Step 3 — Pre-launch checklist (the day before posting)

- [x] Deployed (Vercel + Supabase), webhook green, Shoppy answering ✅ — remaining: swap to the **production number**
- [ ] Permanent token in place (no more 24h deaths)
- [ ] Per-user cap live (it is — `MAX_USER_MSGS_PER_DAY=50`) 
- [ ] Anthropic console → Billing → set a **budget alert** (e.g. $50/mo). Rough cost: an active user ≈ $0.10–0.40/day on Opus; 100 casual users ≈ $50–150/mo. Lever if it runs hot: `ANTHROPIC_MODEL=claude-sonnet-5` cuts ~40% with minor quality loss — your call, flip anytime.
- [ ] 3 friends run the full flow (price check → wishlist → next-day ping) without you explaining anything
- [ ] `wa.me/<PRODUCTION-NUMBER>?text=hi` link tested + QR generated (any QR generator)
- [ ] 45-second screen recording: forward a product → Shoppy's verdict → a deal ping. Real conversation, no mockups.

---

## Marketing Plan — "a lot of users, fast"

**Positioning (one sentence everywhere):** *Shoppy is a free shopping copilot on WhatsApp — forward it anything you're about to buy and it tells you if it's actually a good price, then watches what you want and pings you when it drops.*

**The honest physics:** nothing legitimate gets you "a lot at once" except a coordinated burst + a product moment people retell. Your retellable moment is **"it told me NOT to buy"** — lead every asset with it. And WhatsApp's native gesture (forwarding) is your growth loop: every good verdict ends with something worth forwarding.

**Launch burst (do all within 48h, not spread out):**

| Channel | Play | Realistic yield |
|---|---|---|
| **LinkedIn** (your builder audience + Shopify ecosystem) | The post below + demo video; ask 5 friends to comment in hour one; it's forwardable to commerce people by design | 100s of views, 20–60 tries |
| **Your WhatsApp groups + Status** | Personal note + the link into every group where it's welcome (5–10 groups); post your Status | Highest conversion of all — 30–100 tries |
| **UofT back-to-school** (late Aug timing is perfect) | Club/res/program group chats: "price-check your dorm/laptop list before you overpay" | 50–200 students |
| **RedFlagDeals / r/PersonalFinanceCanada** | Value-first post: "I built a free WhatsApp bot that tells you when a 'deal' is fake" — follow each sub's self-promo rules, engage in comments | Spiky; can be 0 or 500 |
| **Reels/TikTok** (3 clips/wk after launch) | Screen-recordings of real verdicts, esp. fake-sale callouts ("$329 'deal' = regular price") | Compounding, slow burn |
| **Builder Sundays Aug 9** | Live demo + QR on screen; you already have the room | 30–80 highly-engaged |
| **Product Hunt** | Only after 2+ stable weeks + a landing page | Later |

**In-product loop (already built):** after a good outcome Shoppy asks for a forward. Add "how did you hear about me?" to onboarding conversation for attribution — one line in the persona when you want it.

**What decides success (watch weekly in the DB):** new users, **D7 return rate** (the metric), price checks/user, wishlist adds/user, pings sent. If D7 return is >30%, pour on channels; if <10%, fix the product before more marketing.

---

## LinkedIn post draft (edit voice to taste)

> I got tired of not knowing whether a "deal" was actually a deal. So I built Shoppy.
>
> Shoppy is a shopping copilot that lives in WhatsApp. No app, no signup:
>
> → Forward it any product — link or screenshot — and it checks real prices across stores in seconds
> → It's honest to a fault: this week it talked me *out* of buying AirPods at $329 ("that's full price — the real sale is ~$269, wait")
> → Tell it what you want someday and your max price — it quietly watches every day and pings you only when it's genuinely worth buying
>
> It already caught a fake "sale," found me a cheaper listing I'd missed, and holds my whole wishlist with price targets.
>
> Free while in beta → text "hi" to it here: [wa.me link]
>
> Built solo with the WhatsApp Business API + Claude. Next up: connecting merchants so demand on wishlists meets real inventory — if you work in commerce or agentic AI, I'd love to compare notes. 🛒🤖
>
> [45-sec demo video]

---

## After launch (week 2+)
- Template-based deal pings once `deal_alert` is approved
- "What do you know about me?" transparency + per-user delete (PIPEDA hygiene)
- Attribution question in onboarding; simple admin stats script
- Shopify partner app spike (the merchant side) once D7 retention proves out
- `ENABLE_GIGS=1` when you're ready to warm-start Phase 2 on the user base
