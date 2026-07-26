// Load .env if present (native Node loader; no dotenv dependency).
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — fine, plain environment variables still apply
}

export const config = {
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  agentName: process.env.AGENT_NAME ?? "Super",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Abuse/cost guardrail: max inbound messages per member per rolling 24h.
  maxUserMessagesPerDay: Number(process.env.MAX_USER_MSGS_PER_DAY ?? 50),
  // Phase 1 = shopping copilot. Set ENABLE_GIGS=1 to activate the errand/gig
  // economy + intro loops (Phase 2 — machinery is built and tested).
  enableGigs: process.env.ENABLE_GIGS === "1",
  // Wishlist deal-watcher: cheap model, batched checks, code-composed pings.
  dealWatch: {
    enabled: process.env.DEAL_WATCH !== "0",
    model: process.env.DEAL_WATCH_MODEL ?? "claude-haiku-4-5",
    itemIntervalHours: Number(process.env.DEAL_WATCH_HOURS ?? 24),
    maxItemsPerRun: Number(process.env.DEAL_WATCH_MAX ?? 25),
  },
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? "superx.db",
  // Number people text to reach the agent (for wa.me links on the landing/root)
  waLinkNumber: process.env.WA_LINK_NUMBER ?? "15551879714",
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "superx-verify",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
  },
};
