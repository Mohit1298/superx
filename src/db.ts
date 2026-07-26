/**
 * Data layer — PostgreSQL (managed cloud DB, browsable anytime).
 * Set DATABASE_URL, e.g. postgresql://user:pass@host:5432/superx
 */
import pg from "pg";
import { config } from "./config.js";

export interface User {
  id: number;
  phone: string;
  name: string | null;
  role: string | null;
  location: string | null;
  bio: string | null;
  skills: string | null;
  offers: string | null;
  needs: string | null;
  earn_with: string | null;
  area: string | null;
  availability: string | null;
  monthly_budget_cents: number | null;
  referred_by: number | null;
  onboarded: number;
  opted_out: number;
  created_at: string;
}

export interface Task {
  id: number;
  user_id: number;
  title: string;
  details: string | null;
  category: string | null;
  location: string | null;
  fee_offer_cents: number | null;
  deadline: string | null;
  needs_purchase: number;
  status: string;
  created_at: string;
}

export interface Offer {
  id: number;
  task_id: number;
  requester_id: number;
  fulfiller_id: number;
  fee_cents: number;
  pitch: string;
  status: string; // offered | accepted | declined | delivered | confirmed | settled | withdrawn
  expenses_cents: number;
  expense_note: string | null;
  created_at: string;
}

export interface LedgerEntry {
  id: number;
  offer_id: number;
  from_user: number;
  to_user: number;
  amount_cents: number;
  status: string; // due | payer_sent | settled
  created_at: string;
}

export interface WishlistItem {
  id: number;
  user_id: number;
  item: string;
  details: string | null;
  price_ceiling_cents: number | null;
  status: string; // watching | bought | dropped
  last_checked_at: string | null;
  last_price_cents: number | null;
  last_deal_note: string | null;
  alerted_price_cents: number | null;
  alerted_at: string | null;
  created_at: string;
}

export interface Intro {
  id: number;
  task_id: number;
  requester_id: number;
  candidate_id: number;
  pitch: string;
  status: string; // proposed | accepted | declined | connected
  created_at: string;
}

export interface Msg {
  id: number;
  user_id: number;
  direction: "in" | "out";
  body: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function makePool(): pg.Pool {
  const url = config.databaseUrl;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a Postgres instance (Railway/Supabase/local), e.g. postgresql://user:pass@host:5432/superx"
    );
  }
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  return new pg.Pool({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
}

const pool = makePool();

/**
 * Serialize work per member across serverless invocations. WhatsApp users text
 * in bursts; on Vercel each message is an isolated invocation, so an in-memory
 * queue can't order them — a session-level Postgres advisory lock can. The
 * lock rides its own connection (auto-released if the function dies) while the
 * work inside uses the normal pool.
 */
const LOCK_CLASS = 7742; // app-scoped advisory lock namespace ("SX")
export async function withUserLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1, hashtext($2))", [LOCK_CLASS, key]);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [LOCK_CLASS, key]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT, role TEXT, location TEXT, bio TEXT,
      skills TEXT, offers TEXT, needs TEXT,
      earn_with TEXT, area TEXT, availability TEXT,
      monthly_budget_cents INTEGER,
      referred_by INTEGER,
      onboarded INTEGER NOT NULL DEFAULT 0,
      opted_out INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      details TEXT, category TEXT, location TEXT,
      fee_offer_cents INTEGER, deadline TEXT,
      needs_purchase INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      fulfiller_id INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      pitch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offered',
      expenses_cents INTEGER NOT NULL DEFAULT 0,
      expense_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id SERIAL PRIMARY KEY,
      offer_id INTEGER NOT NULL,
      from_user INTEGER NOT NULL,
      to_user INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'due',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      details TEXT,
      price_ceiling_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'watching',
      last_checked_at TIMESTAMPTZ,
      last_price_cents INTEGER,
      last_deal_note TEXT,
      alerted_price_cents INTEGER,
      alerted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS intros (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      candidate_id INTEGER NOT NULL,
      pitch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      wa_message_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Shopify partner merchants (installed our app) and their live catalog,
    -- kept current by product webhooks. This is Shoppy's ground-truth tier.
    CREATE TABLE IF NOT EXISTS merchants (
      shop_domain TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS partner_products (
      id BIGSERIAL PRIMARY KEY,
      shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
      product_id BIGINT NOT NULL,
      variant_id BIGINT NOT NULL,
      title TEXT NOT NULL,
      variant_title TEXT,
      handle TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      compare_at_cents INTEGER,
      available BOOLEAN NOT NULL DEFAULT true,
      image_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (shop_domain, variant_id)
    );
    CREATE INDEX IF NOT EXISTS partner_products_title_idx
      ON partner_products USING gin (to_tsvector('simple', title || ' ' || coalesce(variant_title, '')));
  `);
}

await init();

export const toCents = (dollars: number): number => Math.round(dollars * 100);
export const fmtMoney = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// ---------- users ----------

export async function getOrCreateUser(phone: string): Promise<User> {
  const found = await q<User>("SELECT * FROM users WHERE phone = $1", [phone]);
  if (found[0]) return found[0];
  const inserted = await q<User>(
    "INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING *",
    [phone]
  );
  return inserted[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  return (await q<User>("SELECT * FROM users WHERE id = $1", [id]))[0];
}

const PROFILE_FIELDS = ["name", "role", "location", "bio", "skills", "offers", "needs", "earn_with", "area", "availability"] as const;
export type ProfilePatch = Partial<Record<(typeof PROFILE_FIELDS)[number], string>>;

export async function updateProfile(userId: number, patch: ProfilePatch): Promise<User> {
  for (const field of PROFILE_FIELDS) {
    const value = patch[field];
    if (typeof value === "string" && value.trim().length > 0) {
      await pool.query(`UPDATE users SET ${field} = $1 WHERE id = $2`, [value.trim(), userId]);
    }
  }
  let u = (await getUserById(userId))!;
  if (!u.onboarded && u.name && (u.earn_with || u.skills || u.offers || u.bio)) {
    await pool.query("UPDATE users SET onboarded = 1 WHERE id = $1", [userId]);
    u = (await getUserById(userId))!;
  }
  return u;
}

export async function setMonthlyBudget(userId: number, cents: number | null): Promise<void> {
  await pool.query("UPDATE users SET monthly_budget_cents = $1 WHERE id = $2", [cents, userId]);
}

export async function setOptedOut(userId: number, out: boolean): Promise<void> {
  await pool.query("UPDATE users SET opted_out = $1 WHERE id = $2", [out ? 1 : 0, userId]);
}

export async function searchableMembers(excludeUserId: number, limit = 100): Promise<User[]> {
  return q<User>(
    `SELECT * FROM users
     WHERE id != $1 AND opted_out = 0 AND name IS NOT NULL
       AND (earn_with IS NOT NULL OR skills IS NOT NULL OR offers IS NOT NULL OR bio IS NOT NULL OR role IS NOT NULL)
     ORDER BY id DESC LIMIT $2`,
    [excludeUserId, limit]
  );
}

// ---------- messages ----------

export async function addMessage(userId: number, direction: "in" | "out", body: string): Promise<void> {
  await pool.query("INSERT INTO messages (user_id, direction, body) VALUES ($1, $2, $3)", [userId, direction, body]);
}

export async function recentMessages(userId: number, limit = 30): Promise<Msg[]> {
  const rows = await q<Msg>("SELECT * FROM messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2", [userId, limit]);
  return rows.reverse();
}

/** Inbound messages from this member in the last 24h — for the abuse/cost cap. */
export async function countInboundLastDay(userId: number): Promise<number> {
  const rows = await q<{ n: string }>(
    "SELECT COUNT(*) AS n FROM messages WHERE user_id = $1 AND direction = 'in' AND created_at > now() - interval '24 hours'",
    [userId]
  );
  return Number(rows[0]?.n ?? 0);
}

// ---------- tasks ----------

export async function createTask(
  userId: number,
  fields: {
    title: string;
    details?: string;
    category?: string;
    location?: string;
    fee_offer_cents?: number;
    deadline?: string;
    needs_purchase?: boolean;
  }
): Promise<Task> {
  const rows = await q<Task>(
    `INSERT INTO tasks (user_id, title, details, category, location, fee_offer_cents, deadline, needs_purchase)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      userId,
      fields.title,
      fields.details ?? null,
      fields.category ?? null,
      fields.location ?? null,
      fields.fee_offer_cents ?? null,
      fields.deadline ?? null,
      fields.needs_purchase ? 1 : 0,
    ]
  );
  return rows[0];
}

export async function getTask(id: number): Promise<Task | undefined> {
  return (await q<Task>("SELECT * FROM tasks WHERE id = $1", [id]))[0];
}

export async function setTaskStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE tasks SET status = $1 WHERE id = $2", [status, id]);
}

export async function openTasksFor(userId: number): Promise<Task[]> {
  return q<Task>(
    "SELECT * FROM tasks WHERE user_id = $1 AND status IN ('open','assigned') ORDER BY id DESC LIMIT 10",
    [userId]
  );
}

// ---------- offers ----------

export async function createOffer(
  taskId: number,
  requesterId: number,
  fulfillerId: number,
  feeCents: number,
  pitch: string
): Promise<Offer> {
  const rows = await q<Offer>(
    "INSERT INTO offers (task_id, requester_id, fulfiller_id, fee_cents, pitch) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [taskId, requesterId, fulfillerId, feeCents, pitch]
  );
  return rows[0];
}

export async function getOffer(id: number): Promise<Offer | undefined> {
  return (await q<Offer>("SELECT * FROM offers WHERE id = $1", [id]))[0];
}

export async function setOfferStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE offers SET status = $1 WHERE id = $2", [status, id]);
}

export async function setOfferExpenses(id: number, expensesCents: number, note: string | null): Promise<void> {
  await pool.query("UPDATE offers SET expenses_cents = $1, expense_note = $2 WHERE id = $3", [expensesCents, note, id]);
}

export async function pendingOffersForFulfiller(userId: number): Promise<Offer[]> {
  return q<Offer>("SELECT * FROM offers WHERE fulfiller_id = $1 AND status = 'offered' ORDER BY id DESC LIMIT 5", [userId]);
}

export async function activeGigsForFulfiller(userId: number): Promise<Offer[]> {
  return q<Offer>(
    "SELECT * FROM offers WHERE fulfiller_id = $1 AND status IN ('accepted','delivered','confirmed') ORDER BY id DESC LIMIT 10",
    [userId]
  );
}

export async function activeOffersForRequester(userId: number): Promise<Offer[]> {
  return q<Offer>(
    "SELECT * FROM offers WHERE requester_id = $1 AND status IN ('offered','accepted','delivered','confirmed') ORDER BY id DESC LIMIT 10",
    [userId]
  );
}

export async function recentProposalCount(memberId: number): Promise<number> {
  const a = await q<{ n: string }>(
    "SELECT COUNT(*) AS n FROM offers WHERE fulfiller_id = $1 AND created_at > now() - interval '7 days'",
    [memberId]
  );
  const b = await q<{ n: string }>(
    "SELECT COUNT(*) AS n FROM intros WHERE candidate_id = $1 AND created_at > now() - interval '7 days'",
    [memberId]
  );
  return Number(a[0]?.n ?? 0) + Number(b[0]?.n ?? 0);
}

// ---------- ledger ----------

export async function createLedgerEntry(
  offerId: number,
  fromUser: number,
  toUser: number,
  amountCents: number
): Promise<LedgerEntry> {
  const rows = await q<LedgerEntry>(
    "INSERT INTO ledger (offer_id, from_user, to_user, amount_cents) VALUES ($1, $2, $3, $4) RETURNING *",
    [offerId, fromUser, toUser, amountCents]
  );
  return rows[0];
}

export async function getLedgerByOffer(offerId: number): Promise<LedgerEntry | undefined> {
  return (await q<LedgerEntry>("SELECT * FROM ledger WHERE offer_id = $1", [offerId]))[0];
}

export async function setLedgerStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE ledger SET status = $1 WHERE id = $2", [status, id]);
}

export async function openLedgerFor(userId: number): Promise<LedgerEntry[]> {
  return q<LedgerEntry>(
    "SELECT * FROM ledger WHERE (from_user = $1 OR to_user = $1) AND status != 'settled' ORDER BY id DESC LIMIT 10",
    [userId]
  );
}

// ---------- wishlist ----------

export async function addWishlistItem(
  userId: number,
  item: string,
  details?: string,
  priceCeilingCents?: number
): Promise<WishlistItem> {
  const rows = await q<WishlistItem>(
    "INSERT INTO wishlist (user_id, item, details, price_ceiling_cents) VALUES ($1, $2, $3, $4) RETURNING *",
    [userId, item, details ?? null, priceCeilingCents ?? null]
  );
  return rows[0];
}

export async function getWishlistItem(id: number): Promise<WishlistItem | undefined> {
  return (await q<WishlistItem>("SELECT * FROM wishlist WHERE id = $1", [id]))[0];
}

export async function setWishlistStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE wishlist SET status = $1 WHERE id = $2", [status, id]);
}

export async function watchingWishlistFor(userId: number, limit = 10): Promise<WishlistItem[]> {
  return q<WishlistItem>(
    "SELECT * FROM wishlist WHERE user_id = $1 AND status = 'watching' ORDER BY id DESC LIMIT $2",
    [userId, limit]
  );
}

export async function wishlistDueForCheck(hours: number, limit: number): Promise<WishlistItem[]> {
  return q<WishlistItem>(
    `SELECT w.* FROM wishlist w
     JOIN users u ON u.id = w.user_id
     WHERE w.status = 'watching' AND u.opted_out = 0
       AND (w.last_checked_at IS NULL OR w.last_checked_at < now() - make_interval(hours => $1))
     ORDER BY w.last_checked_at ASC NULLS FIRST
     LIMIT $2`,
    [hours, limit]
  );
}

export async function recordDealCheck(id: number, priceCents: number | null, note: string | null): Promise<void> {
  await pool.query("UPDATE wishlist SET last_checked_at = now(), last_price_cents = $1, last_deal_note = $2 WHERE id = $3", [
    priceCents,
    note,
    id,
  ]);
}

export async function recordDealAlert(id: number, priceCents: number): Promise<void> {
  await pool.query("UPDATE wishlist SET alerted_price_cents = $1, alerted_at = now() WHERE id = $2", [priceCents, id]);
}

// ---------- intros ----------

export async function createIntro(
  taskId: number,
  requesterId: number,
  candidateId: number,
  pitch: string
): Promise<Intro> {
  const rows = await q<Intro>(
    "INSERT INTO intros (task_id, requester_id, candidate_id, pitch) VALUES ($1, $2, $3, $4) RETURNING *",
    [taskId, requesterId, candidateId, pitch]
  );
  return rows[0];
}

export async function getIntro(id: number): Promise<Intro | undefined> {
  return (await q<Intro>("SELECT * FROM intros WHERE id = $1", [id]))[0];
}

export async function setIntroStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE intros SET status = $1 WHERE id = $2", [status, id]);
}

export async function pendingIntrosForCandidate(userId: number): Promise<Intro[]> {
  return q<Intro>("SELECT * FROM intros WHERE candidate_id = $1 AND status = 'proposed' ORDER BY id DESC LIMIT 5", [userId]);
}

export async function activeIntrosForRequester(userId: number): Promise<Intro[]> {
  return q<Intro>(
    "SELECT * FROM intros WHERE requester_id = $1 AND status IN ('proposed','accepted') ORDER BY id DESC LIMIT 10",
    [userId]
  );
}

// ---------- notes ----------

export async function addNote(userId: number, note: string): Promise<void> {
  await pool.query("INSERT INTO notes (user_id, note) VALUES ($1, $2)", [userId, note]);
}

export async function notesFor(userId: number, limit = 15): Promise<string[]> {
  const rows = await q<{ note: string }>("SELECT note FROM notes WHERE user_id = $1 ORDER BY id DESC LIMIT $2", [
    userId,
    limit,
  ]);
  return rows.map((r) => r.note);
}

// ---------- webhook idempotency ----------

export async function markProcessed(waMessageId: string): Promise<boolean> {
  const res = await pool.query("INSERT INTO processed_messages (wa_message_id) VALUES ($1) ON CONFLICT DO NOTHING", [
    waMessageId,
  ]);
  return (res.rowCount ?? 0) === 1;
}

export async function resetDb(): Promise<void> {
  await pool.query(
    "TRUNCATE users, messages, tasks, offers, ledger, intros, wishlist, notes, processed_messages RESTART IDENTITY"
  );
}

// ---------- privacy: full member erasure ----------

/**
 * Erase everything we hold on a member (privacy-page promise). Child rows are
 * deleted outright; the user row is anonymized rather than deleted so the
 * in-flight turn can still complete — the phone (the actual PII) is destroyed,
 * and a future text from that number starts a brand-new blank member.
 */
export async function deleteUserData(userId: number): Promise<void> {
  await q(
    `DELETE FROM ledger WHERE offer_id IN
       (SELECT id FROM offers WHERE requester_id = $1 OR fulfiller_id = $1)`,
    [userId]
  );
  await q("DELETE FROM offers WHERE requester_id = $1 OR fulfiller_id = $1", [userId]);
  await q("DELETE FROM intros WHERE requester_id = $1 OR candidate_id = $1", [userId]);
  await q("DELETE FROM tasks WHERE user_id = $1", [userId]);
  await q("DELETE FROM notes WHERE user_id = $1", [userId]);
  await q("DELETE FROM wishlist WHERE user_id = $1", [userId]);
  await q("DELETE FROM messages WHERE user_id = $1", [userId]);
  await q(
    `UPDATE users SET phone = 'deleted:' || id || ':' || floor(random() * 1e9)::text,
       name = NULL, role = NULL, location = NULL, bio = NULL, skills = NULL, offers = NULL,
       needs = NULL, earn_with = NULL, area = NULL, availability = NULL,
       monthly_budget_cents = NULL, opted_out = 1
     WHERE id = $1`,
    [userId]
  );
}

// ---------- Shopify partner catalog ----------

export interface PartnerHit {
  shop_domain: string;
  title: string;
  variant_title: string | null;
  handle: string;
  variant_id: string;
  price_cents: number;
  compare_at_cents: number | null;
  available: boolean;
}

export async function upsertMerchant(shopDomain: string, accessToken: string): Promise<void> {
  await q(
    `INSERT INTO merchants (shop_domain, access_token, status) VALUES ($1, $2, 'active')
     ON CONFLICT (shop_domain) DO UPDATE SET access_token = EXCLUDED.access_token, status = 'active'`,
    [shopDomain, accessToken]
  );
}

export async function getMerchant(shopDomain: string): Promise<{ access_token: string } | undefined> {
  return (await q<{ access_token: string }>(
    "SELECT access_token FROM merchants WHERE shop_domain = $1 AND status = 'active'",
    [shopDomain]
  ))[0];
}

export async function partnerStats(
  shopDomain: string
): Promise<{ variants: number; products: number; last_update: string | null }> {
  const rows = await q<{ variants: string; products: string; last_update: string | null }>(
    `SELECT count(*)::text AS variants, count(DISTINCT product_id)::text AS products,
            to_char(max(updated_at) AT TIME ZONE 'UTC', 'Mon DD, HH24:MI UTC') AS last_update
     FROM partner_products WHERE shop_domain = $1`,
    [shopDomain]
  );
  return {
    variants: Number(rows[0]?.variants ?? 0),
    products: Number(rows[0]?.products ?? 0),
    last_update: rows[0]?.last_update ?? null,
  };
}

export async function removeMerchant(shopDomain: string): Promise<void> {
  await q("DELETE FROM merchants WHERE shop_domain = $1", [shopDomain]); // products cascade
}

/** Upsert every variant of one Shopify product payload (install sync + webhooks). */
export async function upsertPartnerProduct(
  shopDomain: string,
  p: {
    id: number;
    title: string;
    handle: string;
    status?: string;
    image?: { src?: string } | null;
    variants?: Array<{
      id: number;
      title?: string | null;
      price?: string;
      compare_at_price?: string | null;
      available?: boolean;
      inventory_quantity?: number;
      inventory_policy?: string;
    }>;
  }
): Promise<void> {
  if (p.status && p.status !== "active") {
    await q("DELETE FROM partner_products WHERE shop_domain = $1 AND product_id = $2", [shopDomain, p.id]);
    return;
  }
  for (const v of p.variants ?? []) {
    const available =
      v.available ?? (v.inventory_policy === "continue" || (v.inventory_quantity ?? 0) > 0);
    await q(
      `INSERT INTO partner_products
         (shop_domain, product_id, variant_id, title, variant_title, handle, price_cents, compare_at_cents, available, image_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (shop_domain, variant_id) DO UPDATE SET
         title = EXCLUDED.title, variant_title = EXCLUDED.variant_title, handle = EXCLUDED.handle,
         price_cents = EXCLUDED.price_cents, compare_at_cents = EXCLUDED.compare_at_cents,
         available = EXCLUDED.available, image_url = EXCLUDED.image_url, updated_at = now()`,
      [
        shopDomain,
        p.id,
        v.id,
        p.title,
        v.title ?? null,
        p.handle,
        toCents(Number(v.price ?? 0)),
        v.compare_at_price != null ? toCents(Number(v.compare_at_price)) : null,
        available,
        p.image?.src ?? null,
      ]
    );
  }
}

export async function deletePartnerProduct(shopDomain: string, productId: number): Promise<void> {
  await q("DELETE FROM partner_products WHERE shop_domain = $1 AND product_id = $2", [shopDomain, productId]);
}

/** Word-AND search over the live partner catalog; sized variants filter by `size`. */
export async function searchPartnerCatalog(query: string, size?: string, limit = 8): Promise<PartnerHit[]> {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  const conds: string[] = [];
  const params: unknown[] = [];
  for (const w of words) {
    params.push(`%${w}%`);
    conds.push(`(lower(title) LIKE $${params.length} OR lower(coalesce(variant_title,'')) LIKE $${params.length})`);
  }
  let sizeCond = "";
  if (size?.trim()) {
    params.push(`%${size.trim().toLowerCase()}%`);
    sizeCond = ` AND lower(coalesce(variant_title,'')) LIKE $${params.length}`;
  }
  params.push(limit);
  return q<PartnerHit>(
    `SELECT shop_domain, title, variant_title, handle, variant_id::text AS variant_id,
            price_cents, compare_at_cents, available
     FROM partner_products
     WHERE ${conds.join(" AND ")}${sizeCond}
     ORDER BY available DESC, price_cents ASC
     LIMIT $${params.length}`,
    params
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
