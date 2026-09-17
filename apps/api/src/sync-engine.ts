import type Database from "better-sqlite3";
import {
  applySubstitutionToSquad,
  revertSubstitutionOnSquad,
  matchEventSchema,
  matchSchema,
  matchPlayerSchema,
  playerSchema,
  settingsSchema,
  teamSchema,
  type Match,
  type MatchEvent,
  type Mutation,
  type RemoteChange,
  type SyncRequest,
  type SyncResponse,
} from "@tyloo/shared";
import {
  eventToRow,
  parseSettings,
  rowToEvent,
  rowToMatch,
  rowToMatchPlayer,
  rowToPlayer,
  rowToTeam,
  type EventRow,
  type MatchRow,
} from "./mappers.js";

interface ChangeRow {
  id: number;
  entity: RemoteChange["entity"];
  entity_id: string;
  payload_json: string;
}

export class SyncEngine {
  constructor(private readonly db: Database.Database) {}

  apply(request: SyncRequest): SyncResponse {
    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];

    const applyAll = this.db.transaction(() => {
      this.touchDevice(request.deviceId, request.deviceName ?? "Unknown device", Date.now());

      for (const mutation of request.mutations) {
        try {
          this.applyMutation(request.deviceId, mutation);
          accepted.push(mutation.id);
        } catch (error) {
          rejected.push({
            id: mutation.id,
            reason: error instanceof Error ? error.message : "Unknown mutation error",
          });
        }
      }

      const maxRow = this.db.prepare("SELECT IFNULL(MAX(id), 0) AS cursor FROM change_log").get() as {
        cursor: number;
      };
      this.db
        .prepare(
          `INSERT INTO sync_state (device_id, last_server_cursor, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(device_id) DO UPDATE SET last_server_cursor = excluded.last_server_cursor, updated_at = excluded.updated_at`,
        )
        .run(request.deviceId, maxRow.cursor, Date.now());

      const remoteChanges = this.readChanges(request.lastServerCursor);
      return { accepted, rejected, serverCursor: maxRow.cursor, remoteChanges };
    });

    return applyAll();
  }

  private applyMutation(deviceId: string, mutation: Mutation): void {
    switch (mutation.kind) {
      case "UPSERT_TEAM":
        this.upsertTeam(deviceId, teamSchema.parse(mutation.payload));
        return;
      case "UPSERT_PLAYER":
        this.upsertPlayer(deviceId, playerSchema.parse(mutation.payload));
        return;
      case "UPSERT_MATCH":
        this.upsertMatch(deviceId, matchSchema.parse(mutation.payload));
        return;
      case "UPSERT_MATCH_PLAYER":
        this.upsertMatchPlayer(deviceId, matchPlayerSchema.parse(mutation.payload));
        return;
      case "UPSERT_EVENT":
        this.upsertEvent(deviceId, matchEventSchema.parse(mutation.payload));
        return;
      case "VOID_EVENT":
        this.voidEvent(deviceId, mutation.payload.eventId, mutation.payload.updatedAt);
        return;
      case "CLOCK_TRANSITION":
        this.applyClock(deviceId, mutation.payload.matchId, mutation.payload.clock, mutation.payload.at);
        return;
      case "UPSERT_SETTINGS":
        this.upsertSettings(deviceId, settingsSchema.parse(mutation.payload));
        return;
      case "DELETE_MATCH":
        this.deleteMatch(deviceId, mutation.payload.matchId, mutation.payload.updatedAt);
        return;
      default: {
        const _exhaustive: never = mutation;
        throw new Error(`Unsupported mutation ${( _exhaustive as Mutation).kind}`);
      }
    }
  }

  private upsertTeam(deviceId: string, team: ReturnType<typeof teamSchema.parse>): void {
    this.db
      .prepare(
        `INSERT INTO teams (id, name, logo_data_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           logo_data_url = excluded.logo_data_url,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= teams.updated_at`,
      )
      .run(team.id, team.name, team.logoDataUrl, team.createdAt, team.updatedAt);
    this.appendChange(deviceId, "team", team.id, "upsert", team);
  }

  private upsertPlayer(deviceId: string, player: ReturnType<typeof playerSchema.parse>): void {
    this.db
      .prepare(
        `INSERT INTO players (id, team_id, number, name, position, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           team_id = excluded.team_id,
           number = excluded.number,
           name = excluded.name,
           position = excluded.position,
           active = excluded.active,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= players.updated_at`,
      )
      .run(
        player.id,
        player.teamId,
        player.number,
        player.name,
        player.position,
        player.active ? 1 : 0,
        player.createdAt,
        player.updatedAt,
      );
    this.appendChange(deviceId, "player", player.id, "upsert", player);
  }

  private upsertMatch(deviceId: string, match: Match): void {
    this.db
      .prepare(
        `INSERT INTO matches (
           id, team_id, opponent, competition, date, status, period_count, period_length_ms,
           current_period, clock_running, clock_accumulated_ms, clock_last_started_at, clock_phase,
           created_at, updated_at, started_at, finished_at, deleted
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           opponent = excluded.opponent,
           competition = excluded.competition,
           date = excluded.date,
           status = excluded.status,
           period_count = excluded.period_count,
           period_length_ms = excluded.period_length_ms,
           current_period = excluded.current_period,
           clock_running = excluded.clock_running,
           clock_accumulated_ms = excluded.clock_accumulated_ms,
           clock_last_started_at = excluded.clock_last_started_at,
           clock_phase = excluded.clock_phase,
           updated_at = excluded.updated_at,
           started_at = excluded.started_at,
           finished_at = excluded.finished_at
         WHERE excluded.updated_at >= matches.updated_at`,
      )
      .run(
        match.id,
        match.teamId,
        match.opponent,
        match.competition,
        match.date,
        match.status,
        match.periodCount,
        match.periodLengthMs,
        match.currentPeriod,
        match.clock.running ? 1 : 0,
        match.clock.accumulatedMs,
        match.clock.lastStartedAt,
        match.clock.phase,
        match.createdAt,
        match.updatedAt,
        match.startedAt,
        match.finishedAt,
      );
    this.appendChange(deviceId, "match", match.id, "upsert", match);
  }

  private upsertMatchPlayer(deviceId: string, player: ReturnType<typeof matchPlayerSchema.parse>): void {
    this.db
      .prepare(
        `INSERT INTO match_players (match_id, player_id, starter, on_field, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, player_id) DO UPDATE SET
           starter = excluded.starter,
           on_field = excluded.on_field,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= match_players.updated_at`,
      )
      .run(
        player.matchId,
        player.playerId,
        player.starter ? 1 : 0,
        player.onField ? 1 : 0,
        player.createdAt,
        player.updatedAt,
      );
    this.appendChange(deviceId, "match_player", `${player.matchId}:${player.playerId}`, "upsert", player);
  }

  private upsertEvent(deviceId: string, event: MatchEvent): void {
    const mapped = eventToRow(event);
    const existing = this.db.prepare("SELECT id, status FROM events WHERE id = ?").get(event.id) as
      | { id: string; status: string }
      | undefined;

    if (existing) {
      if (event.status === "VOIDED" && existing.status !== "VOIDED") {
        this.voidEvent(deviceId, event.id, event.updatedAt);
      }
      return;
    }

    this.db
      .prepare(
        `INSERT INTO events (
           id, match_id, player_id, related_player_id, type, period, match_time_ms,
           metadata_json, status, device_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.matchId,
        mapped.playerId,
        mapped.relatedPlayerId,
        event.type,
        event.period,
        event.matchTimeMs,
        JSON.stringify(mapped.metadata),
        event.status,
        event.deviceId,
        event.createdAt,
        event.updatedAt,
      );

    if (event.type === "SUBSTITUTION" && event.status === "ACTIVE") {
      this.applyLocalSubstitution(deviceId, event.matchId, event.playerOffId, event.playerOnId, event.updatedAt, false);
    }

    this.appendChange(deviceId, "event", event.id, "upsert", event);
  }

  private voidEvent(deviceId: string, eventId: string, updatedAt: number): void {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as EventRow | undefined;
    if (!row) {
      return;
    }
    if (row.status === "VOIDED") {
      return;
    }
    this.db.prepare("UPDATE events SET status = 'VOIDED', updated_at = ? WHERE id = ?").run(updatedAt, eventId);
    const next = rowToEvent({ ...row, status: "VOIDED", updated_at: updatedAt });
    if (next.type === "SUBSTITUTION") {
      this.applyLocalSubstitution(deviceId, next.matchId, next.playerOffId, next.playerOnId, updatedAt, true);
    }
    this.appendChange(deviceId, "event", eventId, "void", next);
  }

  private applyClock(
    deviceId: string,
    matchId: string,
    clock: Match["clock"],
    at: number,
  ): void {
    const result = this.db
      .prepare(
        `UPDATE matches
         SET clock_running = ?, clock_accumulated_ms = ?, clock_last_started_at = ?,
             clock_phase = ?, current_period = ?, status = ?, updated_at = ?,
             started_at = CASE WHEN started_at IS NULL AND ? = 1 THEN ? ELSE started_at END,
             finished_at = CASE WHEN ? = 'FINISHED' THEN ? ELSE finished_at END
         WHERE id = ?`,
      )
      .run(
        clock.running ? 1 : 0,
        clock.accumulatedMs,
        clock.lastStartedAt,
        clock.phase,
        clock.period,
        clock.phase,
        at,
        clock.phase === "RUNNING" ? 1 : 0,
        at,
        clock.phase,
        at,
        matchId,
      );
    if (result.changes === 0) {
      return;
    }
    const match = this.db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as MatchRow;
    this.appendChange(deviceId, "match", matchId, "clock", rowToMatch(match));
  }

  private upsertSettings(deviceId: string, settings: ReturnType<typeof settingsSchema.parse>): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES ('app', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= app_settings.updated_at`,
      )
      .run(JSON.stringify(settings), settings.updatedAt);
    this.appendChange(deviceId, "settings", "app", "upsert", settings);
  }

  private deleteMatch(deviceId: string, matchId: string, updatedAt: number): void {
    this.db.prepare("UPDATE matches SET deleted = 1, updated_at = ? WHERE id = ?").run(updatedAt, matchId);
    this.appendChange(deviceId, "match_deleted", matchId, "delete", { matchId, updatedAt });
  }

  private applyLocalSubstitution(
    deviceId: string,
    matchId: string,
    playerOffId: string,
    playerOnId: string,
    updatedAt: number,
    revert: boolean,
  ): void {
    const rows = this.db
      .prepare("SELECT * FROM match_players WHERE match_id = ?")
      .all(matchId) as Array<{
      match_id: string;
      player_id: string;
      starter: number;
      on_field: number;
      created_at: number;
      updated_at: number;
    }>;
    const current = rows.map(rowToMatchPlayer);
    const next = revert
      ? revertSubstitutionOnSquad(current, playerOffId, playerOnId, updatedAt)
      : applySubstitutionToSquad(current, playerOffId, playerOnId, updatedAt);
    const update = this.db.prepare(
      "UPDATE match_players SET on_field = ?, updated_at = ? WHERE match_id = ? AND player_id = ?",
    );
    for (const player of next) {
      update.run(player.onField ? 1 : 0, player.updatedAt, player.matchId, player.playerId);
      this.appendChange(deviceId, "match_player", `${player.matchId}:${player.playerId}`, "upsert", player);
    }
  }

  private appendChange(
    deviceId: string,
    entity: RemoteChange["entity"],
    entityId: string,
    op: string,
    payload: unknown,
  ): void {
    this.db
      .prepare(
        `INSERT INTO change_log (device_id, entity, entity_id, op, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(deviceId, entity, entityId, op, JSON.stringify(payload), Date.now());
  }

  private readChanges(afterCursor: number): RemoteChange[] {
    const rows = this.db
      .prepare(
        `SELECT id, entity, entity_id, payload_json
         FROM change_log
         WHERE id > ?
         ORDER BY id ASC
         LIMIT 500`,
      )
      .all(afterCursor) as ChangeRow[];

    return rows.map((row) => ({
      cursor: row.id,
      entity: row.entity,
      entityId: row.entity_id,
      payload: JSON.parse(row.payload_json),
    }));
  }

  private touchDevice(deviceId: string, name: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO devices (id, name, last_seen_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen_at = excluded.last_seen_at`,
      )
      .run(deviceId, name, now);
  }

  snapshot() {
    const teams = this.db.prepare("SELECT * FROM teams").all().map((row) => rowToTeam(row as never));
    const players = this.db.prepare("SELECT * FROM players").all().map((row) => rowToPlayer(row as never));
    const matches = this.db
      .prepare("SELECT * FROM matches WHERE deleted = 0")
      .all()
      .map((row) => rowToMatch(row as MatchRow));
    const matchPlayers = this.db
      .prepare("SELECT * FROM match_players")
      .all()
      .map((row) => rowToMatchPlayer(row as never));
    const events = this.db.prepare("SELECT * FROM events").all().map((row) => rowToEvent(row as EventRow));
    const settingsRow = this.db.prepare("SELECT value_json FROM app_settings WHERE key = 'app'").get() as
      | { value_json: string }
      | undefined;
    return {
      teams,
      players,
      matches,
      matchPlayers,
      events,
      settings: settingsRow ? parseSettings(settingsRow.value_json) : null,
    };
  }
}

