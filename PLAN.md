# SuperX — The Everyone Economy, on WhatsApp

> **One-liner (sequencing updated 2026-07-23):** Phase 1 — a **personal shopping copilot in your WhatsApp**: forward it anything you're about to buy and it tells you if it's a good price, remembers what you want, and pings you at the right moment. Phase 2 — the same agent becomes the **dispatcher of an everyone-economy** (members earn via errands, deliveries, skills; machinery already built). Endgame — one conversational layer replacing the app-per-vertical incumbents (Uber Eats, DoorDash, TaskRabbit, stays) at near-zero take rates. Shopping leads because it delivers value to user #1 with zero network density; the gig economy activates on the user base shopping accumulates.

---

## 1. The Model (the two-person example that scales)

Mohit and his sister both start chatting with the agent because they want to **make money**. The agent learns: who they are, where they are, what they'd do to earn, when they're free.

Then his sister needs groceries. Instead of opening Uber Eats she texts the agent. The agent knows Mohit is nearby, free, and willing → offers him the job ("$15 to grab and drop groceries in the Annex — want it?") → he accepts → they're connected → he fronts the grocery bill, delivers, submits the receipt → the agent computes what she owes ($62.30 groceries + $15 fee), collects/settles it, and both rate the experience.

**Two people. Complete economy.** Now add 1M people:

- Every need has hundreds of nearby potential fulfillers → fill times collapse to minutes.
- Every member's idle time and spare capacity (their car, their kitchen, their spare room, their skills) becomes sellable **without signing up for five different gig apps**.
- The demand side is free: earners *bring their own needs* with them. Supply acquisition IS demand acquisition — the two-sided cold-start problem collapses into one funnel: "want to earn money from your phone?"
- The agent is the dispatcher, trust layer, and paymaster. No app to install. The marketplace is a contact in WhatsApp.

Why incumbents can't easily respond: Uber/DoorDash monetize by owning a *vertical* supply fleet and charging 20–30%. SuperX's fleet is the user base itself, cross-vertical, at 5–10% — and the relationship is a conversation, not twelve apps.

**Superconnecting (warm intros between members) stays as a capability** — it's the same primitive (match two people, double consent) and it deepens profiles and trust — but it is no longer the core loop. **The core loop is paid fulfillment.**

---

## 2. The Money — how "agent takes money from her and gives to me" actually gets built

This is the highest-stakes design decision. If the company itself receives and forwards members' money, it becomes a **money services business** (FINTRAC registration in Canada, MSB/money-transmitter licensing in the US, per-state). That's a heavy, slow, capital-intensive path — and unnecessary, because payment processors solve it.

**v0 — Ledger + direct settlement (implemented now, zero licensing):**
- The agent never touches funds. It computes and tracks obligations: on completion it tells both sides exactly who owes whom what (fee + reimbursed expenses), instructs settlement by **Interac e-Transfer** (universal in Canada, phone-number addressed — the member already has the other's number from the connection), and closes the loop only when the payer says *sent* and the earner confirms *received*. Non-payment → strike system → removal. In a trust network seeded through real communities, this works — it's how group buys and community boards already run.
- Revenue: none in v0. Correct: you can't (and shouldn't) skim cash flows you don't process. v0's job is to prove fill rate and repeat usage.

**v1 — Stripe Connect escrow (the real thing, ~weeks of work when metrics justify):**
- Earners onboard once via a Stripe Connect Express link in chat (Stripe does KYC/payout details — this is the exact rail DoorDash-class marketplaces use).
- Requester pays a **payment link** in chat when the offer is accepted (funds authorized/held), platform confirms delivery → transfer to earner minus `application_fee` (your 5–10%). Disputes get a hold window. Stripe is the regulated entity; SuperX never holds member funds.
- Grocery-style expenses: v1 keeps reimbursement inside the payment (requester approves receipt total → single charge covers fee + expenses).
- WhatsApp-native payments (WhatsApp Pay / Flows) exist in India & Brazil and are expanding — when available in a market, checkout never leaves the chat.

**Never (until/unless you deliberately become a fintech):** holding balances, member wallets, or routing funds through company accounts.

---

## 3. Why WhatsApp, and the Truth About "Reach Millions Fast"

- **Zero-install distribution.** ~3B people already have WhatsApp. A `wa.me` link tap = onboarded. For gig supply (students, newcomers, gig workers), no-app-no-resume onboarding by chat is a radical acquisition advantage.
- **You cannot blast your way to millions.** Official WhatsApp Business Platform requires opt-in for business-initiated messages (template-gated, tiered: ~250/day new → 1K → 10K → 100K → unlimited, gated by quality rating). Unofficial bulk tools get banned; cold spam violates CASL (Canada, penalties to $10M) / TCPA (US). Non-negotiable.
- **What is unlimited: people messaging you first.** So growth is engineered as pull:
  1. **"Earn money from your phone" is the hook** — it's why both siblings in the founding example showed up. Recruiting earners is easy to make viral (referral bonus paid as priority matching or fee waivers).
  2. **Every fulfilled task is an ad.** The requester watched a neighbor solve their problem in 40 minutes; both sides forward the agent's contact.
  3. **Every unfillable task recruits its own supply:** "No one's nearby right now — forward me to someone who could do this and I'll pay them for it."
  4. **Groups are the accelerant:** one share into a 200-person student/community/newcomer group = hundreds of opted-in earners. Communities (UofT clubs, Builder Sundays network, newcomer orgs, condo groups) are the seeding channel.
- **Precedent that the endgame is sanctioned:** Uber runs official ride-booking on WhatsApp in India; JioMart runs full grocery commerce; WhatsApp Flows + Pay are Meta's own push toward transactional chat. Meta wants this category to exist on its rails.

---

## 4. Competitive Landscape

| Player | Model | The gap SuperX exploits |
|---|---|---|
| Uber Eats / DoorDash / Instacart | Vertical fleets + apps, 20–30% take | Single-vertical, high take, supply must be recruited and managed; no relationship beyond the transaction |
| TaskRabbit / Handy | Odd-job marketplaces | App friction, pro-sourced supply, weak in hyperlocal micro-tasks |
| Uber / Lyft | Rides | Heaviest regulation — SuperX enters last, via community carpools |
| Airbnb | Stays | High take; SuperX starts with trusted-community sublets |
| Boardy | AI superconnector (voice, intros) | Intros only, professionals only, no fulfillment, no payments |
| WhatsApp communities / Facebook groups | Where P2P asks happen today | No matching, no memory, no dispatch, no payments, asks die in scroll |
| Craigslist/Kijiji "gigs" | Raw classifieds | No trust, no coordination, no agent |

**Positioning:** not an app, a *number in your contacts* that pays you and gets things done. People forward a person; nobody forwards a marketplace.

---

## 5. Product Phases

### Phase 0 — Working prototype (this repo, now)
Full loop on WhatsApp Cloud API + local CLI simulator: earner onboarding (what/where/when), task posting with a fee, dispatch offers with double-consent, contact exchange on acceptance, delivery + expense receipts, ledger + settlement confirmation on both sides. Warm intros included. SQLite, one process, ~$0 infra.

### Phase 2 — The errands economy: one neighbourhood, real money (machinery built — activate with ENABLE_GIGS=1)
- 50–150 members in one dense community (UofT campus / one Toronto neighbourhood). Founder-operated: you watch every task, patch gaps manually behind the agent.
- Verticals allowed: grocery/pharmacy runs, food pickup, parcel drops, campus errands, tutoring, small services. (No rides-for-money, no alcohol/tobacco/cannabis, no age-restricted goods — see §9.)
- v0 money (ledger + e-Transfer). Ratings after every task; strike system.
- **Prove:** median time-to-fill < 30 min; ≥70% fill rate; ≥30% of members do both sides (earn AND request) in month one; repeat-request rate ≥40%.

### Phase 3 — Paid platform: Stripe Connect + density playbook
- Stripe Connect Express escrow; take rate 5–10%; referral bonuses.
- Location/availability-aware auto-dispatch (broadcast to top-k eligible earners, first-accept wins), scheduled tasks, recurring tasks ("groceries every Sunday").
- Category expansion by regulatory lightness: **parking spots → sublets/rooms (student housing wedge) → home-cooked meal drops → community carpools**.
- Trust ladder: phone-verified → ID-verified (Stripe KYC) → track-record tiers unlocking higher-value tasks.
- Replicate the neighbourhood playbook: campus-by-campus, community-by-community.

### Phase 1 — THE WEDGE (live now): the shopping copilot + Shopify merchant network

The same agent becomes a **personal shopping assistant**, and the demand data it captures becomes a **merchant product** — one system, two sides:

**Consumer side (foundation implemented now):**
- Members mention things they want someday ("been wanting a mechanical keyboard") → agent saves it to a **wishlist** with a price ceiling, plus an optional **self-declared monthly shopping budget**.
- When deal-watching goes live: agent monitors connected merchant catalogs and pings the member when a wishlist item matches their ceiling and budget — *pre-declared intent + affordability context*, the highest-converting signal in commerce (vs. ads guessing at the moment of browsing).
- Pings are consent-gated and cadence-capped (business-initiated → approved templates; quality rating is a growth gate).

**Money-data rules (non-negotiable design):**
- **Never take custody of banking credentials.** v0 budget is self-declared in chat. If affordability data ever deepens: read-only open-banking aggregators (Flinks/Plaid in Canada) where the user OAuths with their bank and SuperX never sees credentials — and only derived signals (e.g. "budget available: yes/no") are stored, not transactions. Storing bank logins or statements is a breach-liability and trust bomb; permission doesn't fix custody.
- The agent **recommends; the human buys.** Checkout happens via merchant payment links — the agent never executes purchases autonomously.

**Merchant side (a Shopify app — the second surface):**
- Merchants install the SuperX app from the Shopify App Store → grant scoped read access to *their own* store's catalog, prices, discounts (that's how Shopify apps work — each install adds one store to the pool; the network of installs becomes the aggregate catalog).
- What merchants get: (1) a new sales channel — the agent recommends their products to matched wishlists; pay-per-conversion (affiliate/commission via tracked discount codes), and (2) **aggregate demand intelligence** — "43 wishlist entries match 'mechanical keyboard' in the GTA, median ceiling $120."
- **Aggregate only, always.** Merchants never see individual members, wishlists, budgets, or contact info. Selling individual demand data would destroy the trust the whole network runs on (and violate PIPEDA consent). The dashboard is a census, not a directory.
- Distribution wedge: this is the AgentRank thesis from the demand side — the Shopify ecosystem relationships and agentic-commerce credibility already built are the door into first merchant installs.

**Synergy that makes it one company, not two:** a member buys from a local merchant via the agent → a nearby member **delivers it for a fee** (the gig network). Commerce generates gigs; the gig network gives local merchants same-day delivery at 10% instead of 30%. Neither side alone has this loop.

**Sequencing (updated 2026-07-23 — this is now Phase 1):** chosen as the wedge because it delivers value to user #1 with zero network density — the gig economy needs neighbourhood liquidity before it's any good, a price-checking copilot doesn't. Consumer side is **live**: real-time price checks via web search, wishlists with ceilings, self-declared budgets, honest don't-buy advice. Next build: the Shopify app (partner account, app review, catalog sync, aggregate demand dashboard) once consumer retention shows. The errands economy (Phase 2) then activates on top of the accumulated user base with one env flag.

### Phase 4 — Eating the verticals
- Rides: scheduled/community carpools first (regulatory-lighter), on-demand only with proper licensing per city.
- Stays: trusted-network sublets with deposits via Stripe; insurance partner.
- Food: home-chef meal networks (cottage-food rules per province/state), restaurant pickup running on member-couriers.
- Businesses join as requesters (local restaurants using network couriers at 10% instead of DoorDash's 30% — a direct wedge into incumbent revenue).

### Phase 5 — The network becomes infrastructure
- Agent-to-agent commerce: external AI agents hire the network via API/MCP ("book a courier", "find a person to assemble this") — the human-labor endpoint for the agentic economy. (Direct AgentRank synergy: AgentRank ranks the supply, SuperX fulfills the demand.)
- Cities as franchises of the playbook; communities run branded sub-networks on the shared graph.

---

## 6. Architecture

### MVP (built in this repo)

```
WhatsApp user ──▶ Meta Cloud API ──webhook──▶ Express server
                                                  │ per-user FIFO queue
                                                  ▼
                                     Agent brain (claude-opus-4-8 + tools)
                                                  │
   ┌─────────────┬───────────────┬───────────────┼──────────────────┬───────────────┐
update_profile  post_task     search_network  offer_task /       mark_delivered   ledger tools
remember        (fee, place,  (skills + area  accept / decline   (expenses)       (confirm sent /
                deadline)      + earn_with)   ──▶ messages the                     received)
                                              OTHER member
                                                  │
                                            SQLite (node:sqlite)
        + intro tools (propose/accept/decline) — superconnector capability retained
```

- **Channel abstraction:** same brain behind WhatsApp or the CLI simulator (`npm run cli`) — demo the entire two-sided grocery flow solo, today, before Meta review.
- **State machine in code, not prompt:** offers (`offered → accepted → delivered → confirmed → settled`), ledger entries, opt-outs, and fatigue caps are DB-enforced. The model can't skip consent or invent amounts — money figures come only from tool results.
- **Prompt caching:** stable persona block cached across all users; per-user state injected after the breakpoint.

### Scale path

| Concern | MVP | Scale |
|---|---|---|
| DB | SQLite | Postgres + PostGIS (geo) + pgvector (skills) |
| Dispatch | Claude ranks full member list | Geo+availability filter → top-k broadcast, first-accept; Claude writes the pitch |
| Payments | ledger + e-Transfer confirmations | Stripe Connect (Express accounts, application fees, holds) |
| Queue | in-process | Redis/BullMQ workers; scheduled + recurring tasks via cron |
| Messaging | direct Cloud API | outbox + rate limiter honoring tier limits + template manager |
| Trust | ratings + strikes | ID verification (Stripe), insurance partner, dispute workflows |
| Model | Opus everywhere | Haiku triage for chit-chat; Opus for dispatch/matching/disputes |

---

## 7. Data Model (implemented)

- **users** — phone, name, role, location, bio, skills, offers, needs + **earn_with** (what they'll do for money), **area** (neighbourhood), **availability**; opt-out flag; referred_by
- **tasks** — the asks: title, details, category, **location, fee_offer (cents), deadline, needs_purchase** (fulfiller fronts money, e.g. groceries); status `open → assigned → completed/cancelled`
- **offers** — dispatch state machine: task, fulfiller, **fee_cents**, status `offered → accepted/declined → delivered → confirmed → settled`, **expenses_cents + expense_note** (receipts)
- **ledger** — who owes whom: offer, from_user, to_user, amount_cents, status `due → payer_sent → settled`
- **intros** — superconnector flow (`proposed → accepted/declined → connected`)
- **messages / notes / processed_messages** — transcripts, agent memory, webhook idempotency

---

## 8. Dispatch ("right person at the right time")

1. **v0 (now):** `search_network` returns members with earn_with/area/availability; Claude reasons about fit (near? willing? free? trustworthy?) and offers to the best 1–2 with fatigue caps (max 3 offers/member/week uninvited).
2. **v1:** hard filters (geo radius, availability window, category opt-in) → top-k simultaneous broadcast, first-accept wins, others get a graceful "taken". Response-rate and completion-rate feed ranking.
3. **v2:** learned dispatch from outcomes (accept rate, completion, ratings, time-of-day patterns); surge-style fee suggestions ("offer $18 — it's raining"); proactive earning nudges to idle members in high-demand windows (template-gated, sparing).

---

## 9. Trust, Safety & Compliance (day one, non-negotiable)

- **Money:** never hold funds (§2). Amounts only from tool state. Both-side settlement confirmation; non-payment strikes.
- **Consent:** contact info exchanged only when an offer/intro is accepted. STOP honored instantly, hard-coded before the model sees a message (CASL/TCPA). Uninvited-offer fatigue caps.
- **Task policy:** no age-restricted goods (alcohol, tobacco, cannabis, weapons), no prescription pickups (PHIPA/HIPAA + pharmacy rules), no rides-for-money until licensed per city, nothing illegal; agent declines and explains.
- **In-person safety:** public handoff guidance, share-with-a-friend nudges, new-member value caps (e.g. ≤$100 tasks until trust tier 2), incident reporting → human review; insurance partner in Phase 2.
- **Privacy:** members see only what consent reveals; PIPEDA/GDPR basics; delete-on-request; no data resale, ever.
- **Platform:** official Cloud API only; templates only with opt-in; quality rating monitored as a growth-gating KPI.
- **Worker classification:** members are independent peers choosing tasks with transparent fees (no algorithmic wage-setting, no exclusivity, no penalties for declining) — keep it that way; it's both the ethical stance and the defensible one.

---

## 10. Business Model

1. **v0:** free (prove the loop; you don't process the money anyway).
2. **Phase 2+ take rate:** 5–10% application fee via Stripe Connect on fulfilled tasks — structurally undercutting 20–30% incumbents.
3. **SuperX Pro** (requesters): subscriptions for recurring/priority tasks (weekly groceries, standing courier).
4. **Business accounts:** local restaurants/shops paying 10% for network courier fulfillment (vs 30% incumbent) — B2B wedge.
5. **Commerce layer (Phase 2.5):** per-conversion commission on wishlist-matched sales + merchant SaaS for the aggregate demand dashboard.
6. **Float-free, individual-data-sale-free, always.** Aggregate demand intelligence is a product; individual member data never is. Trust is the moat.

---

## 11. Metrics That Matter

- **Fill rate** (% of tasks accepted within SLA) and **median time-to-fill** — the product IS these two numbers
- **GMV** and take-rate revenue (Phase 2+); average earner monthly earnings (supply retention driver)
- **Both-sided %** — members who earn AND request (the flywheel indicator; the sister/brother number)
- **Repeat-request rate** (weekly) and earner weekly active %
- **Settlement completion rate** (v0 trust health; target >98%)
- **K-factor** from forwarded contacts (target >0.5 early)
- **Safety:** incident rate, dispute rate (<2%), WhatsApp quality rating (green)

---

## 12. 30 / 60 / 90 Days

**Days 0–30 — Prototype → first real tasks**
- [x] Phase-0 build: earner onboarding, task posting, dispatch offers, delivery + expenses, ledger settlement, intros (this repo)
- [ ] Meta app + test number + tunnel → live on your own WhatsApp; **run the actual sister grocery test**
- [ ] Business verification started (takes days–weeks); name/persona finalized; one-page site with the wa.me link
- [ ] 10–20 members (family/friends/dorm), 20 real tasks, founder watching every one

**Days 30–60 — One community, ~100 members**
- Launch in one neighbourhood/campus community + Builder Sundays network (Aug 9)
- Ratings + strikes live; auto-dispatch v1 (geo/availability filters, broadcast top-k); admin dashboard (tasks, fills, settlements, funnel)
- Postgres migration; template approval for re-engagement notifications
- Begin Stripe Connect integration behind a flag

**Days 60–90 — Prove the economics**
- Targets: 250 members, 500 fulfilled tasks, fill ≥70%, both-sided ≥30%, settlement ≥98%
- Stripe Connect beta with 6–8% fee on a task subset; measure conversion vs e-Transfer
- Write the raise narrative on the trace: "we run a two-sided labor market in WhatsApp with X-min fills at Y% take" — this is a fundable seed story if the numbers hold

---

## 13. Top Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Money handling drifts into unlicensed transmission | **Critical** | v0 pure ledger (never touch funds); v1 Stripe Connect; legal review before any wallet-like feature |
| Banking-data custody (commerce layer) | **Critical** | Self-declared budgets only in v0; read-only open-banking aggregator (Flinks/Plaid) later; never store credentials/statements; agent recommends, never auto-purchases |
| Merchant data product leaks individual demand | High | Aggregate-only dashboards enforced at the query layer; no member PII in any merchant surface; PIPEDA consent language from day one |
| Safety incident (in-person tasks between strangers) | **Critical** | Trust tiers, value caps, public-handoff guidance, incident response, insurance partner in Phase 2; community-seeded membership (not anonymous public) |
| Density cold-start (empty network = no fills = churn) | High | One neighbourhood at a time; founder fulfills gaps personally in week 1 (you ARE the elastic supply); "earn money" recruiting is one-funnel |
| Meta platform dependence | High | Strict official-API compliance; portable graph (phone numbers); SMS/Telegram fallback channels behind same brain |
| Regulatory per-vertical (food/rides/stays) | High | Sequence lightest-first (errands → parking → sublets → meals → carpools); geo-fence features per jurisdiction; decline restricted tasks in-agent |
| Non-payment / disputes in v0 | Med | Both-side confirmation, strikes, small task values early, move to escrow in Phase 2 |
| Trust destroyed by one spammy push | Med | No cold outreach ever; fatigue caps; STOP hard-coded; quality rating as KPI |
| LLM cost per task | Med | Prompt caching (done); Haiku triage later; Opus only for dispatch decisions |
| Incumbent response | Med | They'd have to abandon 25% take rates and vertical apps to follow; community trust doesn't copy-paste |
| Solo-founder bandwidth | High | Phase 1 is deliberately one-neighbourhood, founder-operated; CLI demo doubles as the pitch |

---

## 14. What's Implemented in This Repo (Phase 0)

```
src/
  index.ts        server entry (Express, WhatsApp webhook)
  server.ts       webhook verify + receive, dedup, per-user FIFO
  config.ts       env config
  db.ts           SQLite schema + access (users, tasks, offers, ledger, intros, notes)
  agent/
    brain.ts      conversation loop: history + cached persona + live state → Claude tool runner
    prompts.ts    persona + per-user dynamic context (pending offers, gigs, debts, intros)
    tools.ts      update_profile (incl. self-declared budget), remember, post_task, complete_task,
                  search_network, offer_task, accept_offer, decline_offer, mark_delivered,
                  confirm_completed, record_payment_sent, confirm_payment_received,
                  add_wishlist_item, update_wishlist_item,
                  propose_intro, accept_intro, decline_intro
  channels/whatsapp.ts   Cloud API transport
  cli.ts          local simulator (play requester AND fulfiller)
  seed.ts         demo members with earn_with/area/availability
test/smoke.ts     no-LLM test: full grocery loop + intro loop + permission guards
```

### Immediate next steps
1. Meta app + test number → run the real sister grocery test end-to-end
2. Ratings table + strike enforcement
3. Geo/availability hard filters before Claude ranks (dispatch v1)
4. Stripe Connect Express spike behind a flag
5. Admin report CLI: fills, time-to-fill, settlements
6. Commerce layer: Shopify Partner account + app scaffold (catalog read scopes), wishlist↔catalog matcher cron, aggregate demand dashboard v0
