/**
 * Local simulator — talk to the agent as any phone number, no Meta account
 * needed. Cross-member messages (intro proposals, connection cards) print
 * inline so you can play both sides of a double-opt-in intro.
 *
 *   npm run cli
 *   /as +15550001001        switch which member you're texting as
 *   /seed                   load demo members
 *   /reset                  wipe the database
 */
import readline from "node:readline";
import { config } from "./config.js";
import { resetDb } from "./db.js";
import { enqueue, handleIncomingMessage } from "./agent/brain.js";
import { seedDemoMembers } from "./seed.js";

let me = process.env.SUPERX_USER ?? "15550000001";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

async function sendTo(phone: string, text: string): Promise<void> {
  if (phone === me) {
    console.log(`\n${green(bold(config.agentName + ":"))} ${text}\n`);
  } else {
    console.log(dim(`\n  ┌─ ${config.agentName} → +${phone} ──────────────`));
    for (const line of text.split("\n")) console.log(dim(`  │ ${line}`));
    console.log(dim(`  └────────────────────────────────────\n`));
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = () => rl.setPrompt(bold(`+${me} > `));

console.log(bold(`\nSuperX simulator`));
console.log(`You are texting ${config.agentName} as ${bold("+" + me)}.`);
console.log(`Commands: /as <phone>   /seed   /reset   /exit\n`);
prompt();
rl.prompt();

rl.on("line", async (raw) => {
  const line = raw.trim();
  if (!line) return rl.prompt();

  if (line === "/exit" || line === "/quit") return rl.close();
  if (line === "/reset") {
    await resetDb();
    console.log(dim("Database wiped.\n"));
    return rl.prompt();
  }
  if (line === "/seed") {
    const n = await seedDemoMembers();
    console.log(dim(`Seeded ${n} demo members.\n`));
    return rl.prompt();
  }
  if (line.startsWith("/as")) {
    const arg = line.slice(3).trim().replace(/[^0-9]/g, "");
    if (arg) {
      me = arg;
      console.log(dim(`Now texting as +${me}.\n`));
    } else {
      console.log(dim("Usage: /as +15550001001\n"));
    }
    prompt();
    return rl.prompt();
  }

  await enqueue(me, () => handleIncomingMessage(me, line, sendTo));
  rl.prompt();
});

rl.on("close", () => {
  console.log(dim("\nBye.\n"));
  process.exit(0);
});
