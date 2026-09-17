import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MATCH_EXPORT_FORMAT,
  MATCH_EXPORT_VERSION,
  formatMatchTime,
  parseTouchlineBackupJson,
  summarizeBackup,
  type Match,
  type MatchEvent,
  type Player,
  type TouchlineBackup,
} from "@tyloo/shared";
import {
  db,
  defaultAppSettings,
  getAppSettings,
  getSetting,
  SETTING_KEYS,
  setSetting,
} from "../../db/database";
import { toLocalWriteError } from "../../lib/localWrite";
import { APP_VERSION } from "../../lib/appVersion";

export interface BackupSummary {
  teams: number;
  players: number;
  matches: number;
  events: number;
}

export class BackupService {
  async exportAll(): Promise<{ backup: TouchlineBackup; filename: string; json: string }> {
    const [
      settings,
      teams,
      players,
      matches,
      matchPlayers,
      events,
      clockStates,
      matchRuntimeStates,
      formationSnapshots,
      formationPresets,
      lineupDrafts,
    ] = await Promise.all([
      getAppSettings(),
      db.teams.toArray(),
      db.players.toArray(),
      db.matches.toArray(),
      db.matchPlayers.toArray(),
      db.events.toArray(),
      db.clockStates.toArray(),
      db.matchRuntimeStates.toArray(),
      db.formationSnapshots.toArray(),
      db.formationPresets.toArray(),
      db.lineupDrafts.toArray(),
    ]);

    const backup: TouchlineBackup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      data: {
        settings,
        teams,
        players,
        matches,
        matchPlayers,
        events,
        clockStates,
        matchRuntimeStates,
        formationSnapshots,
        formationPresets,
        lineupDrafts,
      },
    };

    await setSetting(SETTING_KEYS.lastFullBackupAt, Date.now());
    const date = backup.exportedAt.slice(0, 10);
    const filename = `touchline-backup-${date}.json`;
    return { backup, filename, json: `${JSON.stringify(backup, null, 2)}\n` };
  }

  inspect(text: string) {
    const result = parseTouchlineBackupJson(text);
    if (!result.ok) {
      return result;
    }
    return {
      ok: true as const,
      backup: result.backup,
      summary: summarizeBackup(result.backup),
    };
  }

  async restore(backup: TouchlineBackup): Promise<void> {
    try {
      await db.transaction("rw", db.tables, async () => {
        await Promise.all([
          db.teams.clear(),
          db.players.clear(),
          db.matches.clear(),
          db.matchPlayers.clear(),
          db.events.clear(),
          db.clockStates.clear(),
          db.matchRuntimeStates.clear(),
          db.formationSnapshots.clear(),
          db.formationPresets.clear(),
          db.lineupDrafts.clear(),
        ]);
        if (backup.data.teams.length) {
          await db.teams.bulkPut(backup.data.teams);
        }
        if (backup.data.players.length) {
          await db.players.bulkPut(backup.data.players);
        }
        if (backup.data.matches.length) {
          await db.matches.bulkPut(backup.data.matches);
        }
        if (backup.data.matchPlayers.length) {
          await db.matchPlayers.bulkPut(backup.data.matchPlayers);
        }
        if (backup.data.events.length) {
          await db.events.bulkPut(backup.data.events);
        }
        if (backup.data.clockStates.length) {
          await db.clockStates.bulkPut(backup.data.clockStates);
        }
        if (backup.data.matchRuntimeStates.length) {
          await db.matchRuntimeStates.bulkPut(backup.data.matchRuntimeStates);
        }
        if (backup.data.formationSnapshots.length) {
          await db.formationSnapshots.bulkPut(backup.data.formationSnapshots);
        }
        if (backup.data.formationPresets.length) {
          await db.formationPresets.bulkPut(backup.data.formationPresets);
        }
        if (backup.data.lineupDrafts.length) {
          await db.lineupDrafts.bulkPut(backup.data.lineupDrafts);
        }
        await setSetting(SETTING_KEYS.appSettings, {
          ...defaultAppSettings(),
          ...backup.data.settings,
          keepAwake: backup.data.settings.keepAwake ?? true,
        });
      });
    } catch (error) {
      throw toLocalWriteError(error, "The backup could not be written to this iPad.");
    }
  }

  async exportMatch(matchId: string): Promise<{ filename: string; json: string } | null> {
    const match = await db.matches.get(matchId);
    if (!match) {
      return null;
    }
    const [matchPlayers, events, clockState, matchRuntimeState, formationSnapshots] = await Promise.all([
      db.matchPlayers.where("matchId").equals(matchId).toArray(),
      db.events.where("matchId").equals(matchId).toArray(),
      db.clockStates.get(matchId),
      db.matchRuntimeStates.get(matchId),
      db.formationSnapshots.where("matchId").equals(matchId).toArray(),
    ]);
    const playerIds = [...new Set(matchPlayers.map((item) => item.playerId))];
    const players = (await db.players.bulkGet(playerIds)).filter((player): player is Player => Boolean(player));
    const payload = {
      format: MATCH_EXPORT_FORMAT,
      version: MATCH_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      match,
      players,
      matchPlayers,
      events,
      clockState: clockState ?? null,
      matchRuntimeState: matchRuntimeState ?? null,
      formationSnapshots,
    };
    const safeOpponent = match.opponent.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const filename = `touchline-match-${match.date}-${safeOpponent || "match"}.json`;
    return { filename, json: `${JSON.stringify(payload, null, 2)}\n` };
  }

  async exportMatchCsv(matchId: string): Promise<{ filename: string; csv: string } | null> {
    const match = await db.matches.get(matchId);
    if (!match) {
      return null;
    }
    const [events, players] = await Promise.all([
      db.events.where("matchId").equals(matchId).sortBy("createdAt"),
      db.players.toArray(),
    ]);
    const byId = new Map(players.map((player) => [player.id, player]));
    const rows = [
      ["period", "matchTime", "eventType", "playerNumber", "playerName", "metadata", "status"],
      ...events.map((event) => csvRow(event, byId)),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const safeOpponent = match.opponent.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    return {
      filename: `touchline-match-${match.date}-${safeOpponent || "match"}.csv`,
      csv: `${csv}\n`,
    };
  }

  async lastFullBackupAt(): Promise<number | null> {
    return getSetting<number | null>(SETTING_KEYS.lastFullBackupAt, null);
  }
}

function csvRow(event: MatchEvent, players: Map<string, Player>): string[] {
  const player = "playerId" in event && event.playerId ? players.get(event.playerId) : undefined;
  return [
    String(event.period),
    formatMatchTime(event.matchTimeMs),
    event.type,
    player ? String(player.number) : "",
    player?.name ?? "",
    eventMetadata(event, players),
    event.status,
  ];
}

function eventMetadata(event: MatchEvent, players: Map<string, Player>): string {
  switch (event.type) {
    case "GOAL":
      return event.assistPlayerId ? `assist:${players.get(event.assistPlayerId)?.name ?? event.assistPlayerId}` : "";
    case "SUBSTITUTION":
      return `off:${players.get(event.playerOffId)?.name ?? event.playerOffId};on:${players.get(event.playerOnId)?.name ?? event.playerOnId}`;
    case "GOALKEEPER_CHANGE":
      return `${players.get(event.previousGoalkeeperId)?.name ?? event.previousGoalkeeperId}→${players.get(event.newGoalkeeperId)?.name ?? event.newGoalkeeperId}`;
    case "FORMATION_CHANGE":
      return `${event.previousFormation}→${event.newFormation}`;
    case "LINEUP_CHANGE":
      return event.formation;
    case "ASSIST":
    case "SHOT":
    case "SHOT_ON_TARGET":
    case "KEY_DEFENCE":
    case "INTERCEPTION":
    case "FOUL":
    case "FOUL_WON":
    case "OFFSIDE":
    case "SAVE":
    case "YELLOW_CARD":
    case "RED_CARD":
    case "OWN_GOAL":
    case "CORNER_FOR":
    case "CORNER_AGAINST":
    case "GOAL_AGAINST":
    case "MATCH_START":
    case "MATCH_PAUSE":
    case "MATCH_RESUME":
    case "PERIOD_END":
    case "PERIOD_START":
    case "MATCH_END":
      return "";
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export function downloadTextFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function daysSince(timestamp: number, now = Date.now()): number {
  return Math.floor((now - timestamp) / 86_400_000);
}

export const backupService = new BackupService();

export type { Match };
