import { createId, DEFAULT_TEAM_NAME } from "@tyloo/shared";
import type Database from "better-sqlite3";
import { DEFAULT_TEAM_ID, DEV_PLAYERS } from "./seed-data.js";

export function seedDevelopmentData(db: Database.Database, teamName = DEFAULT_TEAM_NAME): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO teams (id, name, logo_data_url, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
  ).run(DEFAULT_TEAM_ID, teamName, now, now);

  const insert = db.prepare(
    `INSERT INTO players (id, team_id, number, name, position, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE players
     SET number = ?, name = ?, position = ?, active = 1, updated_at = ?
     WHERE id = ?`,
  );

  for (const player of DEV_PLAYERS) {
    const existing = db
      .prepare("SELECT id FROM players WHERE team_id = ? AND number = ?")
      .get(DEFAULT_TEAM_ID, player.number) as { id: string } | undefined;
    if (existing) {
      update.run(player.number, player.name, player.position, now, existing.id);
    } else {
      insert.run(createId(), DEFAULT_TEAM_ID, player.number, player.name, player.position, now, now);
    }
  }
}
