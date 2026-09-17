import { z } from "zod";
import { BACKUP_FORMAT, BACKUP_VERSION, MATCH_EXPORT_FORMAT, MATCH_EXPORT_VERSION } from "./constants.js";
import {
  clockStateRecordSchema,
  matchEventSchema,
  matchPlayerSchema,
  matchSchema,
  playerSchema,
  settingsSchema,
  teamSchema,
} from "./schemas.js";

export const touchlineBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  data: z.object({
    settings: settingsSchema,
    teams: z.array(teamSchema),
    players: z.array(playerSchema),
    matches: z.array(matchSchema),
    matchPlayers: z.array(matchPlayerSchema),
    events: z.array(matchEventSchema),
    clockStates: z.array(clockStateRecordSchema),
  }),
});

export type TouchlineBackup = z.infer<typeof touchlineBackupSchema>;

export type BackupValidationError =
  | { ok: false; reason: "not-json" }
  | { ok: false; reason: "invalid-format" }
  | { ok: false; reason: "unsupported-version"; version: unknown }
  | { ok: false; reason: "malformed"; message: string };

export type BackupValidationResult =
  | { ok: true; backup: TouchlineBackup }
  | BackupValidationError;

export function validateTouchlineBackup(input: unknown): BackupValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "malformed", message: "Backup must be a JSON object." };
  }
  const record = input as { format?: unknown; version?: unknown };
  if (record.format !== BACKUP_FORMAT) {
    return { ok: false, reason: "invalid-format" };
  }
  if (record.version !== BACKUP_VERSION) {
    return { ok: false, reason: "unsupported-version", version: record.version };
  }
  const parsed = touchlineBackupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "malformed", message: parsed.error.issues[0]?.message ?? "Backup data is incomplete." };
  }
  return { ok: true, backup: parsed.data };
}

export function parseTouchlineBackupJson(text: string): BackupValidationResult {
  try {
    return validateTouchlineBackup(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, reason: "not-json" };
  }
}

export function summarizeBackup(backup: TouchlineBackup): {
  teams: number;
  players: number;
  matches: number;
  events: number;
} {
  return {
    teams: backup.data.teams.length,
    players: backup.data.players.length,
    matches: backup.data.matches.length,
    events: backup.data.events.length,
  };
}

export const matchExportSchema = z.object({
  format: z.literal(MATCH_EXPORT_FORMAT),
  version: z.literal(MATCH_EXPORT_VERSION),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  match: matchSchema,
  players: z.array(playerSchema),
  matchPlayers: z.array(matchPlayerSchema),
  events: z.array(matchEventSchema),
  clockState: clockStateRecordSchema.nullable(),
});

export type MatchExport = z.infer<typeof matchExportSchema>;
