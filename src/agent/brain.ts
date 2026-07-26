import { Anthropic } from "@anthropic-ai/sdk";
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

export interface InboundImage {
  base64: string;
  mediaType: string;
}

/**
 * Handle one inbound message from a member and reply (plus any cross-member
 * side effects the tools trigger, e.g. intro proposals). `image` rides along
 * only in the live turn — history stores the caption/placeholder text.
 */
export async function handleIncomingMessage(
  phone: string,
  text: string,
  sendTo: SendFn,
  image?: InboundImage
): Promise<void> {
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
  const messages: { role: "user" | "assistant"; content: any }[] = history.map((m) => ({
    role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));
  if (messages.length === 0) messages.push({ role: "user", content: text });

  // The member sent a photo/screenshot: swap the final user turn (stored as
  // caption/placeholder text) for real multimodal content.
  if (image) {
    messages[messages.length - 1] = {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
        { type: "text", text },
      ],
    };
  }

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
        // Generous per-turn budget: a 3-retailer head-to-head burns ~6-8
        // searches. The real cost guardrail is the per-user daily message cap.
        { type: "web_search_20260209", name: "web_search", max_uses: 12 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
      ],
      max_iterations: 10,
    });

    // Iterate rather than await: server-tool turns can stop with
    // stop_reason "pause_turn", which the runner doesn't auto-resume.
    let final: { content: Array<{ type: string; text?: string }>; stop_reason?: string | null } | null = null;
    for await (const message of runner) {
      final = message;
      // Telemetry for the narration-leak hunt: exact block shape of every
      // turn, so a leaked reply in the wild maps back to its structure.
      console.log(
        `[brain] turn blocks (stop=${message.stop_reason}):`,
        message.content.map((b: { type: string }) => b.type).join(",")
      );
      if (message.stop_reason === "pause_turn") {
        runner.pushMessages({ role: "assistant", content: message.content });
      }
    }

    // The reply is ONLY the trailing text blocks — text before/between tool
    // calls is the model narrating its work ("let me parse the JSON…") and
    // must never reach the member. Join with "" (not "\n"): citations split
    // sentences across blocks and spans carry their own spacing.
    const content = final?.content ?? [];
    let lastToolIdx = -1;
    for (let i = 0; i < content.length; i++) {
      if (content[i].type !== "text") lastToolIdx = i;
    }
    const reply = content
      .slice(lastToolIdx + 1)
      .map((b: { type: string; text?: string }) => b.text ?? "")
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
