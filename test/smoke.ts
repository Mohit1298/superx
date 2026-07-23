/**
 * End-to-end plumbing test with NO LLM calls: exercises the profile, task,
 * dispatch, expense, ledger/settlement, wishlist, and intro state machines
 * directly through the tool implementations. Needs DATABASE_URL pointing at a
 * scratch/dev Postgres — it WIPES the database first:
 *
 *   DATABASE_URL=postgresql://localhost:5432/superx_test npm run smoke
 */
import assert from "node:assert/strict";
import {
  closeDb,
  getOrCreateUser,
  getUserById,
  pendingIntrosForCandidate,
  pendingOffersForFulfiller,
  getTask,
  getOffer,
  getLedgerByOffer,
  watchingWishlistFor,
  resetDb,
} from "../src/db.js";
import { impls, ToolCtx } from "../src/agent/tools.js";

const sent: { to: string; text: string }[] = [];
const ctxFor = (userId: number): ToolCtx => ({
  userId,
  agentName: "Sam",
  sendTo: async (to, text) => {
    sent.push({ to, text });
  },
});
const lastSent = () => sent[sent.length - 1];

await resetDb();

// ===========================================================================
// SCENARIO 1 — the grocery loop (sister requests, brother earns)
// ===========================================================================

const sister = await getOrCreateUser("15550008001");
const brother = await getOrCreateUser("15550008002");
await impls.update_profile(ctxFor(sister.id), { name: "Mia Bendale", area: "Annex, Toronto", earn_with: "tutoring" });
await impls.update_profile(ctxFor(brother.id), {
  name: "Mo Bendale",
  area: "Annex, Toronto",
  earn_with: "grocery runs, deliveries",
  availability: "evenings",
});
console.log("✓ [gig] sister + brother onboarded as earners");

const task = JSON.parse(
  await impls.post_task(ctxFor(sister.id), {
    title: "Grocery run from Metro",
    details: "12 items, list to be shared. Deliver to Annex.",
    category: "errand",
    location: "Annex, Toronto",
    fee_offer_dollars: 15,
    deadline: "today 7pm",
    needs_purchase: true,
  })
);
assert.equal(task.fee_offer, "$15.00");
console.log("✓ [gig] task posted with fee", task);

const search = JSON.parse(await impls.search_network(ctxFor(sister.id), { query: "grocery run near Annex tonight" }));
assert.ok(search.members.some((m: { member_id: number }) => m.member_id === brother.id));
console.log(`✓ [gig] search returns ${search.members.length} member(s) incl. brother`);

const offer = JSON.parse(
  await impls.offer_task(ctxFor(sister.id), {
    task_id: task.task_id,
    fulfiller_member_id: brother.id,
    fee_dollars: 15,
    message_to_fulfiller: "Hey Mo! $15 gig near you: grocery run from Metro by 7pm (you front the bill, reimbursed on receipt). Want it? Reply yes or no.",
  })
);
assert.equal(offer.status, "offered");
assert.equal(lastSent().to, brother.phone);
assert.equal((await pendingOffersForFulfiller(brother.id)).length, 1);
console.log("✓ [gig] offer sent to brother, pending his yes/no");

const badAccept = JSON.parse(await impls.accept_offer(ctxFor(sister.id), { offer_id: offer.offer_id }));
assert.ok(badAccept.error);
console.log("✓ [gig] requester cannot accept for the fulfiller");

sent.length = 0;
const accepted = JSON.parse(await impls.accept_offer(ctxFor(brother.id), { offer_id: offer.offer_id }));
assert.equal(accepted.status, "accepted");
assert.ok(accepted.requester_contact_card.includes("Mia"));
assert.equal(lastSent().to, sister.phone);
assert.ok(lastSent().text.includes("Mo Bendale"));
assert.equal((await getTask(task.task_id))!.status, "assigned");
console.log("✓ [gig] accepted: contacts exchanged, task assigned");

sent.length = 0;
const delivered = JSON.parse(
  await impls.mark_delivered(ctxFor(brother.id), { offer_id: offer.offer_id, expenses_dollars: 62.3, expense_note: "Metro receipt" })
);
assert.equal(delivered.status, "delivered");
assert.equal(delivered.total_due, "$77.30");
assert.equal(lastSent().to, sister.phone);
assert.ok(lastSent().text.includes("$77.30"));
console.log("✓ [gig] delivered with receipt; requester asked to confirm $77.30");

sent.length = 0;
const confirmed = JSON.parse(await impls.confirm_completed(ctxFor(sister.id), { offer_id: offer.offer_id }));
assert.equal(confirmed.status, "confirmed");
assert.equal(confirmed.amount_due, "$77.30");
assert.ok(confirmed.pay_to.includes("Mo Bendale"));
assert.equal((await getLedgerByOffer(offer.offer_id))!.status, "due");
assert.equal((await getTask(task.task_id))!.status, "completed");
assert.equal(lastSent().to, brother.phone);
console.log("✓ [gig] confirmed: ledger due $77.30, e-Transfer instructions issued");

await impls.record_payment_sent(ctxFor(sister.id), { offer_id: offer.offer_id });
assert.equal((await getLedgerByOffer(offer.offer_id))!.status, "payer_sent");
const settled = JSON.parse(await impls.confirm_payment_received(ctxFor(brother.id), { offer_id: offer.offer_id }));
assert.equal(settled.status, "settled");
assert.equal(settled.earned, "$77.30");
assert.equal((await getOffer(offer.offer_id))!.status, "settled");
console.log("✓ [gig] payment settled both sides — full loop complete");

const again = JSON.parse(await impls.confirm_payment_received(ctxFor(brother.id), { offer_id: offer.offer_id }));
assert.ok(again.error);
console.log("✓ [gig] cannot settle twice");

// ===========================================================================
// SCENARIO 2 — the superconnector intro loop
// ===========================================================================

sent.length = 0;
const alice = await getOrCreateUser("15550009001");
const bob = await getOrCreateUser("15550009002");
await impls.update_profile(ctxFor(alice.id), { name: "Alice Founder", role: "founder", needs: "a brand designer" });
await impls.update_profile(ctxFor(bob.id), { name: "Bob Designer", role: "brand designer", skills: "logos, Figma" });

const introTask = JSON.parse(await impls.post_task(ctxFor(alice.id), { title: "Find a brand designer", category: "intro" }));
const proposed = JSON.parse(
  await impls.propose_intro(ctxFor(alice.id), {
    task_id: introTask.task_id,
    candidate_member_id: bob.id,
    message_to_candidate: "Hey Bob! Alice, a founder in the network, needs a brand designer. Open to an intro? Reply yes or no.",
  })
);
assert.equal(proposed.status, "proposed");
assert.equal((await pendingIntrosForCandidate(bob.id)).length, 1);

sent.length = 0;
const introAccept = JSON.parse(await impls.accept_intro(ctxFor(bob.id), { intro_id: proposed.intro_id }));
assert.equal(introAccept.status, "connected");
assert.ok(introAccept.reply_to_current_member.includes("Alice"));
assert.equal(lastSent().to, alice.phone);
assert.ok(lastSent().text.includes("Bob Designer"));
assert.equal((await getTask(introTask.task_id))!.status, "matched");
console.log("✓ [intro] double-opt-in intro loop works end to end");

// ===========================================================================
// SCENARIO 3 — wishlist + self-declared budget
// ===========================================================================

const budgetSave = JSON.parse(await impls.update_profile(ctxFor(brother.id), { monthly_shopping_budget_dollars: 150 }));
assert.equal(budgetSave.profile.monthly_shopping_budget, "$150.00");
assert.equal((await getUserById(brother.id))!.monthly_budget_cents, 15000);

const wish = JSON.parse(
  await impls.add_wishlist_item(ctxFor(brother.id), {
    item: "Keychron K8 mechanical keyboard",
    details: "brown switches preferred",
    price_ceiling_dollars: 120,
  })
);
assert.equal(wish.status, "watching");
assert.equal(wish.price_ceiling, "$120.00");
assert.equal((await watchingWishlistFor(brother.id)).length, 1);

const bought = JSON.parse(await impls.update_wishlist_item(ctxFor(brother.id), { wishlist_id: wish.wishlist_id, status: "bought" }));
assert.equal(bought.status, "bought");
assert.equal((await watchingWishlistFor(brother.id)).length, 0);

const badWish = JSON.parse(await impls.update_wishlist_item(ctxFor(sister.id), { wishlist_id: wish.wishlist_id, status: "dropped" }));
assert.ok(badWish.error);
console.log("✓ [shop] wishlist + budget captured, lifecycle + ownership guard work");

console.log("\nSMOKE TEST PASSED — gig loop + intro loop + wishlist (Postgres)");
await closeDb();
