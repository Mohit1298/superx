/** Manual one-shot deal-watch run:  npm run deals */
import { runDealWatch } from "./dealwatch.js";
import { closeDb } from "./db.js";
import { sendWhatsAppText } from "./channels/whatsapp.js";
import { whatsappConfigured } from "./channels/whatsapp.js";

async function main() {
  const sendTo = whatsappConfigured()
    ? sendWhatsAppText
    : async (phone: string, text: string) => {
        console.log(`[dry-run ping → +${phone}]\n${text}\n`);
      };
  const s = await runDealWatch(sendTo);
  console.log(
    `Deal watch done: ${s.checked} item(s) checked, ${s.pinged} ping(s) sent, ${s.stored} stored (window-blocked), ${s.errors} error(s).`
  );
  await closeDb();
}

main().catch((e) => {
  console.error("deal watch failed:", e);
  process.exit(1);
});
