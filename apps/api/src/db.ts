import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function openDatabase(databasePath: string): Database.Database {
  const resolved = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  configureSqlite(db);
  return db;
}

export function openMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  configureSqlite(db);
  return db;
}

function configureSqlite(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
}
