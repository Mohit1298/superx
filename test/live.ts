/**
 * Live agent test — real Claude calls, scripted conversation, no typing needed.
 * Costs a few cents. Run:  npm run live   (uses a scratch DB unless DB_PATH set)
 */
import { resetDb } from "../src/db.js";
import { enqueue, handleIncomingMessage } from "../src/agent/brain.js";
import { seedDemoMembers } from "../src/seed.js";

const ME = "15550000001";

async function sendTo(phone: string, text: string): Promise<void> {
  if (phone === ME) {
    console.log(`\n🟢 Sam → you:\n${text}\n`);
  } else {
    console.log(`\n📤 [Sam → +${phone}]:\n${text}\n`);
  }
}

async function say(text: string): Promise<void> {
  console.log(`🔵 you: ${text}`);
  await enqueue(ME, () => handleIncomingMessage(ME, text, sendTo));
}

await resetDb();
await seedDemoMembers();
console.log("Seeded demo members. Starting live conversation...\n");

await say(
  "hi! I'm Mohit, I live in the Annex in Toronto. I could do grocery runs or deliveries to earn some cash — mostly free evenings."
);
await say(
  "actually right now I need something myself: groceries from Metro by 7pm tonight, about 12 items. I'll pay $15."
);

console.log("LIVE TEST DONE — the agent above is exactly what WhatsApp users would see.");
const { closeDb } = await import("../src/db.js");
await closeDb();
