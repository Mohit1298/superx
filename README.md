# SuperX

**Phase 1 (live): a personal shopping copilot on WhatsApp.** Forward it anything you're about to buy — it checks real prices via web search, tells you *good deal / overpriced / wait*, remembers your wishlist and budget, and is honest enough to talk you out of bad purchases. **Phase 2 (built, behind `ENABLE_GIGS=1`):** the everyone-economy — members earn via errands and deliveries, the agent dispatches, coordinates, and settles the money. See [PLAN.md](PLAN.md).

## Quickstart (no Meta account needed)

Requires Postgres (local: `brew install postgresql@15`, then `createdb superx`) and `DATABASE_URL` in `.env`.

```bash
npm install
npm run cli        # local simulator
```

**Production:** see [LAUNCH.md](LAUNCH.md) — Railway deploy (24/7 server + managed Postgres with a data browser), Meta production number, and the launch marketing plan.

Try the shopping copilot (Phase 1, default mode):

```
is $329 CAD a good price for AirPods Pro 2?     # live web-search price check + verdict
watch it for me, I'd pay $250                    # wishlist with a ceiling
my fun budget is about $150/month                # self-declared budget
```

Or the Phase 2 errands economy (`ENABLE_GIGS=1 npm run cli`) — the sister/brother grocery story:

```
/seed                              # 6 demo members incl. Yusuf, a campus courier
I need groceries from Metro by 7pm, I'll pay $15
/as +15550001006                   # become Yusuf → accept, deliver ($62.30 receipt),
                                   # confirm, settle — the agent runs the whole ledger
```

Auth: the Anthropic SDK picks up `ANTHROPIC_API_KEY`, or an `ant auth login` profile if no key is set.

Verify all state machines without any LLM calls:

```bash
DB_PATH=smoke.db npm run smoke
```

## Going live on WhatsApp

1. [Meta for Developers](https://developers.facebook.com) → create app → add the **WhatsApp** product. You get a test number + temporary token immediately.
2. Copy `.env.example` → `.env`; fill `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, pick a `WHATSAPP_VERIFY_TOKEN`.
3. Run the server and a tunnel:
   ```bash
   npm run dev
   npx ngrok http 3000        # or cloudflared tunnel
   ```
4. In the Meta app: WhatsApp → Configuration → webhook URL `https://<tunnel>/webhook` + your verify token; subscribe to the `messages` field.
5. Message the test number from your phone. (Test numbers message up to 5 manually-added recipients — enough for the family pilot. Production needs business verification.)

## Environment

| Var | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude credentials (optional with `ant` profile) | — |
| `ANTHROPIC_MODEL` | Agent model | `claude-opus-4-8` |
| `AGENT_NAME` | Persona name | `Sam` |
| `WHATSAPP_TOKEN` | Cloud API access token | — |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone id | — |
| `WHATSAPP_VERIFY_TOKEN` | Webhook handshake secret | `superx-verify` |
| `PORT` / `DB_PATH` | Server port / SQLite file | `3000` / `superx.db` |

## Layout

```
src/agent/    brain (Claude tool runner loop), persona, 15 tools
src/channels/ WhatsApp Cloud API transport
src/          server (webhook), cli simulator, db, seed
test/         smoke test: full gig lifecycle + intro lifecycle, no LLM
```

## Invariants enforced in code (not just prompt)

- **Money:** the platform never holds funds. `offered → accepted → delivered → confirmed → settled` with a ledger entry; members pay each other directly (Interac e-Transfer) and BOTH sides confirm. Amounts are computed in cents in the DB — the model can't invent figures. Stripe Connect escrow is the Phase-2 upgrade (see PLAN.md §2).
- **Consent:** contact info crosses conversations only when an offer/intro is accepted; uninvited-offer fatigue caps per member.
- **Opt-out:** STOP/START handled before the model ever sees a message.
