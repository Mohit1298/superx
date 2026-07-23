/**
 * Live shopping-copilot test — real Claude calls incl. web search.
 * Run:  npx tsx test/live-shop.ts   (use a scratch DB_PATH)
 */
import { resetDb } from "../src/db.js";
import { enqueue, handleIncomingMessage } from "../src/agent/brain.js";

const ME = "15550000002";

async function sendTo(phone: string, text: string): Promise<void> {
  console.log(phone === ME ? `\n🟢 Sam → you:\n${text}\n` : `\n📤 [Sam → +${phone}]:\n${text}\n`);
}

async function say(text: string): Promise<void> {
  console.log(`🔵 you: ${text}`);
  await enqueue(ME, () => handleIncomingMessage(ME, text, sendTo));
}

await resetDb();
console.log("Starting live shopping conversation...\n");

await say("hey, my friend said you check prices? I'm thinking of buying AirPods Pro 2 — Best Buy has them at $329 CAD. good deal or no?");
await say("hmm ok. I don't need them urgently — watch them for me, I'd pay like $250. I'm Mohit btw, in Toronto");

console.log("LIVE SHOPPING TEST DONE");
const { closeDb } = await import("../src/db.js");
await closeDb();
