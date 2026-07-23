import { config } from "./config.js";
import { createServer } from "./server.js";
import { sendWhatsAppText, whatsappConfigured } from "./channels/whatsapp.js";
import { runDealWatch } from "./dealwatch.js";

const app = createServer();

function scheduleDealWatch(): void {
  const run = async () => {
    try {
      const s = await runDealWatch(sendWhatsAppText);
      if (s.checked > 0) {
        console.log(`[dealwatch] checked=${s.checked} pinged=${s.pinged} stored=${s.stored} errors=${s.errors}`);
      }
    } catch (err) {
      console.error("[dealwatch] run failed:", err);
    }
  };
  setTimeout(run, 90_000); // first pass shortly after boot
  setInterval(run, 60 * 60_000); // hourly tick; items due once per itemIntervalHours
}

app.listen(config.port, () => {
  console.log(`SuperX up on :${config.port} — model ${config.model}, persona "${config.agentName}"`);
  console.log(`Mode: ${config.enableGigs ? "FULL (shopping + gig economy + intros)" : "Phase 1 — shopping copilot (set ENABLE_GIGS=1 for gigs)"}`);
  if (whatsappConfigured()) {
    console.log(`WhatsApp: configured (phone_number_id ${config.whatsapp.phoneNumberId})`);
    console.log(`Webhook:  GET/POST /webhook (verify token "${config.whatsapp.verifyToken}")`);
  } else {
    console.log(`WhatsApp: NOT configured — set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID.`);
    console.log(`Tip: run "npm run cli" to talk to the agent locally without Meta setup.`);
  }
  if (config.dealWatch.enabled && whatsappConfigured()) {
    console.log(`Deal watch: ON (${config.dealWatch.model}, every ${config.dealWatch.itemIntervalHours}h per item)`);
    scheduleDealWatch();
  }
});
