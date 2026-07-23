import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { addMessage, countInboundLastDay, getOrCreateUser, recentMessages, setOptedOut } from "../db.js";
import { PERSONA, buildDynamicContext } from "./prompts.js";
import { buildTools, SendFn } from "./tools.js";

// Lazy so the CLI/server can boot (seed, reset, health) without credentials;
// resolves ANTHROPIC_API_KEY (or an `ant auth login` profile) on first message.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const OPT_OUT = new Set(["stop", "unsubscribe", "opt out", "optout"]);
const OPT_IN = new Set(["start", "unstop", "opt in", "optin"]);

/**
 * Handle one inbound message from a member and reply (plus any cross-member
 * side effects the tools trigger, e.g. intro proposals).
 */
export async function handleIncomingMessage(phone: string, text: string, sendTo: SendFn): Promise<void> {
  const user = await getOrCreateUser(phone);
  const normalized = text.trim().toLowerCase();

  // Compliance paths are hard-coded, never left to the model.
  if (user.opted_out) {
    if (OPT_IN.has(normalized)) {
      await setOptedOut(user.id, false);
      await addMessage(user.id, "in", text);
      const back = `Welcome back! You're re-subscribed. What can I help you find?`;
      await addMessage(user.id, "out", back);
      await sendTo(phone, back);
    }
    return; // opted-out members are never messaged otherwise
  }
  if (OPT_OUT.has(normalized)) {
    await addMessage(user.id, "in", text);
    await setOptedOut(user.id, true);
    const bye = `Understood — you won't hear from me again. Reply START anytime to come back. Take care!`;
    await addMessage(user.id, "out", bye);
    await sendTo(phone, bye);
    return;
  }

  // Cost/abuse guardrail: cap inbound messages per member per rolling 24h.
  const inboundToday = await countInboundLastDay(user.id);
  if (inboundToday >= config.maxUserMessagesPerDay) {
    await addMessage(user.id, "in", text);
    if (inboundToday === config.maxUserMessagesPerDay) {
      const capMsg = `You've hit today's message limit 🙈 — I reset every 24h. See you tomorrow!`;
      await addMessage(user.id, "out", capMsg);
      await sendTo(phone, capMsg);
    }
    return;
  }

  await addMessage(user.id, "in", text);

  // Rebuild conversation window. First message must be role "user".
  const history = await recentMessages(user.id, 30);
  while (history.length && history[0].direction === "out") history.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({
    role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));
  if (messages.length === 0) messages.push({ role: "user", content: text });

  try {
    const runner = getClient().beta.messages.toolRunner({
      model: config.model,
      max_tokens: 4096, // WhatsApp replies are deliberately short
      system: [
        { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
        { type: "text", text: await buildDynamicContext(user) },
      ],
      messages,
      tools: [
        ...buildTools({ userId: user.id, agentName: config.agentName, sendTo }),
        // Server-side tools (run on Anthropic's infra): live price checks and
        // opening links the member forwarded.
        { type: "web_search_20260209", name: "web_search", max_uses: 5 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      ],
      max_iterations: 10,
    });

    // Iterate rather than await: server-tool turns can stop with
    // stop_reason "pause_turn", which the runner doesn't auto-resume.
    let final: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      final = message;
      if (message.stop_reason === "pause_turn") {
        runner.pushMessages({ role: "assistant", content: message.content });
      }
    }

    // Join with "" (not "\n"): web-search citations split sentences across
    // text blocks, and spans carry their own spacing. Then tidy whitespace.
    const reply = (final?.content ?? [])
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (reply) {
      await addMessage(user.id, "out", reply);
      await sendTo(phone, reply);
    }
  } catch (err) {
    console.error(`[brain] error for ${phone}:`, err);
    const oops = `Ugh, I hit a snag on my end. Give me a minute and message me again?`;
    await addMessage(user.id, "out", oops);
    await sendTo(phone, oops);
  }
}

// ---------------------------------------------------------------------------
// Per-user FIFO so a member's messages are processed in order, while different
// members are handled concurrently.
// ---------------------------------------------------------------------------

const queues = new Map<string, Promise<void>>();

export function enqueue(phone: string, job: () => Promise<void>): Promise<void> {
  const prev = queues.get(phone) ?? Promise.resolve();
  const next = prev.then(job).catch((e) => console.error(`[queue] ${phone}:`, e));
  queues.set(phone, next);
  return next;
}
