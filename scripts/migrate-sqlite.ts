/**
 * One-time copy of the old SQLite database into Postgres (preserves ids).
 *
 *   SQLITE_PATH=superx.db DATABASE_URL=postgresql://... npx tsx scripts/migrate-sqlite.ts
 *
 * Safe to re-run only against an EMPTY target — it does plain inserts.
 */
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const sqlitePath = process.env.SQLITE_PATH ?? "superx.db";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL");

const TABLES: Record<string, string[]> = {
  users: [
    "id", "phone", "name", "role", "location", "bio", "skills", "offers", "needs",
    "earn_with", "area", "availability", "monthly_budget_cents", "referred_by",
    "onboarded", "opted_out", "created_at",
  ],
  messages: ["id", "user_id", "direction", "body", "created_at"],
  tasks: ["id", "user_id", "title", "details", "category", "location", "fee_offer_cents", "deadline", "needs_purchase", "status", "created_at"],
  offers: ["id", "task_id", "requester_id", "fulfiller_id", "fee_cents", "pitch", "status", "expenses_cents", "expense_note", "created_at"],
  ledger: ["id", "offer_id", "from_user", "to_user", "amount_cents", "status", "created_at"],
  wishlist: ["id", "user_id", "item", "details", "price_ceiling_cents", "status", "last_checked_at", "last_price_cents", "last_deal_note", "alerted_price_cents", "alerted_at", "created_at"],
  intros: ["id", "task_id", "requester_id", "candidate_id", "pitch", "status", "created_at"],
  notes: ["id", "user_id", "note", "created_at"],
  processed_messages: ["wa_message_id", "created_at"],
};

async function main() {
  const sqlite = new DatabaseSync(sqlitePath);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url!.includes("localhost") || url!.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
  });

  for (const [table, cols] of Object.entries(TABLES)) {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    } catch {
      console.log(`${table}: not in sqlite, skipped`);
      continue;
    }
    for (const row of rows) {
      const values = cols.map((c) => {
        const v = row[c] ?? null;
        // SQLite stored UTC timestamps without a zone marker — tag them.
        if (typeof v === "string" && c.endsWith("_at") && /^\d{4}-\d{2}-\d{2} /.test(v)) return v + "Z";
        if (c === "created_at" && typeof v === "string") return v + (v.endsWith("Z") ? "" : "Z");
        return v;
      });
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      await pool.query(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values
      );
    }
    if (cols.includes("id")) {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`
      );
    }
    console.log(`${table}: ${rows.length} row(s) copied`);
  }

  await pool.end();
  console.log("MIGRATION COMPLETE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
