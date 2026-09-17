import type Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations.js";

export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((row) => (row as { id: string }).id),
  );
  const insert = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.id, Date.now());
    });
    apply();
  }
}
