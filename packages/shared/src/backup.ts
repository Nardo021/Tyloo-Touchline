import { z } from "zod";
import { BACKUP_FORMAT, BACKUP_VERSION, MATCH_EXPORT_FORMAT, MATCH_EXPORT_VERSION } from "./constants.js";
import { normalizeFormationType } from "./formation.js";
import { runtimeFromMatchPlayers } from "./lineup.js";
import { matchPhaseFromClock } from "./phase.js";
import {
  clockStateRecordSchema,
  formationPresetSchema,
  formationSnapshotSchema,
  lineupDraftSchema,
  matchEventSchema,
  matchPlayerSchema,
  matchRuntimeStateSchema,
  matchSchema,
  playerSchema,
  settingsSchema,
  teamSchema,
} from "./schemas.js";

const backupDataSchema = z.object({
  settings: settingsSchema,
  teams: z.array(teamSchema),
  players: z.array(playerSchema),
  matches: z.array(matchSchema),
  matchPlayers: z.array(matchPlayerSchema),
  events: z.array(matchEventSchema),
  clockStates: z.array(clockStateRecordSchema),
  matchRuntimeStates: z.array(matchRuntimeStateSchema).default([]),
  formationSnapshots: z.array(formationSnapshotSchema).default([]),
  formationPresets: z.array(formationPresetSchema).default([]),
  lineupDrafts: z.array(lineupDraftSchema).default([]),
});

const backupDataSchemaV2 = backupDataSchema.omit({
  formationSnapshots: true,
  formationPresets: true,
  lineupDrafts: true,
}).extend({
  formationSnapshots: z.array(formationSnapshotSchema).optional(),
  formationPresets: z.array(formationPresetSchema).optional(),
  lineupDrafts: z.array(lineupDraftSchema).optional(),
});

export const touchlineBackupSchemaV1 = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  data: backupDataSchemaV2.omit({ matchRuntimeStates: true }).extend({
    matchRuntimeStates: z.array(matchRuntimeStateSchema).optional(),
  }),
});

export const touchlineBackupSchemaV2 = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(2),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  data: backupDataSchemaV2,
});

export const touchlineBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  data: backupDataSchema,
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

export function migrateBackupToCurrent(input: unknown): TouchlineBackup | null {
  const record = input as { version?: unknown };
  if (record.version === BACKUP_VERSION) {
    const parsed = touchlineBackupSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    return {
      ...parsed.data,
      data: {
        ...parsed.data.data,
        matches: parsed.data.data.matches.map(withInferredPhase),
        formationSnapshots: parsed.data.data.formationSnapshots.map(withNormalizedSnapshot),
        formationPresets: parsed.data.data.formationPresets.map(withNormalizedFormation),
        lineupDrafts: parsed.data.data.lineupDrafts.map(withNormalizedFormation),
      },
    };
  }
  if (record.version === 2) {
    const parsed = touchlineBackupSchemaV2.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    return {
      format: parsed.data.format,
      version: BACKUP_VERSION,
      exportedAt: parsed.data.exportedAt,
      appVersion: parsed.data.appVersion,
      data: {
        ...parsed.data.data,
        matches: parsed.data.data.matches.map(withInferredPhase),
        formationSnapshots: (parsed.data.data.formationSnapshots ?? []).map(withNormalizedSnapshot),
        formationPresets: (parsed.data.data.formationPresets ?? []).map(withNormalizedFormation),
        lineupDrafts: (parsed.data.data.lineupDrafts ?? []).map(withNormalizedFormation),
      },
    };
  }
  if (record.version === 1) {
    const parsed = touchlineBackupSchemaV1.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    const runtimeStates = parsed.data.data.matchRuntimeStates ?? deriveRuntimeStates(parsed.data.data);
    return {
      format: parsed.data.format,
      version: BACKUP_VERSION,
      exportedAt: parsed.data.exportedAt,
      appVersion: parsed.data.appVersion,
      data: {
        ...parsed.data.data,
        matches: parsed.data.data.matches.map(withInferredPhase),
        matchRuntimeStates: runtimeStates,
        formationSnapshots: [],
        formationPresets: [],
        lineupDrafts: [],
      },
    };
  }
  return null;
}

function withInferredPhase<T extends {
  clock: { phase: "NOT_STARTED" | "RUNNING" | "PAUSED" | "HALFTIME" | "FINISHED"; period: number };
  phase?: string;
  clockMode?: string;
  startingFormation?: string | null;
}>(
  match: T,
): T {
  return {
    ...match,
    phase: match.phase ?? matchPhaseFromClock(match.clock.phase, match.clock.period),
    clockMode: match.clockMode ?? "cumulative",
    startingFormation: match.startingFormation == null
      ? match.startingFormation
      : normalizeFormationType(match.startingFormation),
  };
}

function withNormalizedFormation<T extends { formation: string }>(item: T): T {
  return { ...item, formation: normalizeFormationType(item.formation) };
}

function withNormalizedSnapshot<T extends { formation: string; status?: string }>(snapshot: T): T & { status: "ACTIVE" | "VOIDED" } {
  return {
    ...snapshot,
    formation: normalizeFormationType(snapshot.formation),
    status: snapshot.status === "VOIDED" ? "VOIDED" : "ACTIVE",
  };
}

function deriveRuntimeStates(data: {
  matches: Array<{ id: string; currentPeriod: number }>;
  matchPlayers: Array<{ matchId: string; playerId: string; onField: boolean; createdAt: number; updatedAt: number; starter: boolean }>;
}) {
  return data.matches.map((match) =>
    runtimeFromMatchPlayers(
      match.id,
      data.matchPlayers.filter((player) => player.matchId === match.id),
      match.currentPeriod,
      Date.now(),
      "",
    ),
  );
}

export function validateTouchlineBackup(input: unknown): BackupValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "malformed", message: "Backup must be a JSON object." };
  }
  const record = input as { format?: unknown; version?: unknown };
  if (record.format !== BACKUP_FORMAT) {
    return { ok: false, reason: "invalid-format" };
  }
  if (record.version !== 1 && record.version !== 2 && record.version !== BACKUP_VERSION) {
    return { ok: false, reason: "unsupported-version", version: record.version };
  }
  const migrated = migrateBackupToCurrent(input);
  if (!migrated) {
    return { ok: false, reason: "malformed", message: "Backup data is incomplete." };
  }
  return { ok: true, backup: migrated };
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
  matchRuntimeState: matchRuntimeStateSchema.nullable(),
  formationSnapshots: z.array(formationSnapshotSchema).default([]),
});

export type MatchExport = z.infer<typeof matchExportSchema>;
