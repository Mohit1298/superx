/** One-shot: local SQLite (pre-cloud era) → Supabase superx schema. */
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

async function main() {
  const sqlite = new DatabaseSync("/Users/mohitbendale/Desktop/SuperX/superx.db");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // Clean slate: remove smoke-test rows so real ids migrate 1:1.
  await pool.query(
    "TRUNCATE users, messages, tasks, offers, ledger, intros, wishlist, notes, processed_messages RESTART IDENTITY"
  );

  const tables = ["users", "messages", "tasks", "offers", "ledger", "intros", "wishlist", "notes", "processed_messages"];
  for (const t of tables) {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = sqlite.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
    } catch {
      console.log(`${t}: (table missing locally, skipped)`);
      continue;
    }
    for (const r of rows) {
      const cols = Object.keys(r);
      const params = cols.map((_, i) => `$${i + 1}`).join(",");
      await pool.query(
        `INSERT INTO ${t} (${cols.join(",")}) VALUES (${params}) ON CONFLICT DO NOTHING`,
        cols.map((c) => r[c])
      );
    }
    if (t !== "processed_messages") {
      await pool.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`);
    }
    console.log(`${t}: ${rows.length} rows`);
  }

  const check = await pool.query(
    "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM messages) AS messages, (SELECT COUNT(*) FROM wishlist) AS wishlist"
  );
  console.log("Supabase now has:", check.rows[0]);
  await pool.end();
  console.log("MIGRATION DONE");
}

main().catch((e) => {
  console.error("MIGRATION FAILED:", e.message);
  process.exit(1);
});
