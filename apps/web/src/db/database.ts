import {
  DEFAULT_TEAM_ID,
  DEFAULT_TEAM_NAME,
  defaultFirstHalfPreset,
  defaultSecondHalfPreset,
  matchPhaseFromClock,
  normalizeFormationType,
  type AppSettings,
  type ClockStateRecord,
  type FormationPreset,
  type FormationSnapshot,
  type LineupDraft,
  type Match,
  type MatchEvent,
  type MatchPlayer,
  type MatchRuntimeState,
  type Player,
  type Team,
} from "@tyloo/shared";
import Dexie, { type Table } from "dexie";

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface MetadataRecord {
  key: string;
  value: unknown;
}

export class TylooDatabase extends Dexie {
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  matchPlayers!: Table<MatchPlayer, [string, string]>;
  events!: Table<MatchEvent, string>;
  clockStates!: Table<ClockStateRecord, string>;
  matchRuntimeStates!: Table<MatchRuntimeState, string>;
  formationSnapshots!: Table<FormationSnapshot, string>;
  formationPresets!: Table<FormationPreset, string>;
  lineupDrafts!: Table<LineupDraft, string>;
  settings!: Table<SettingRecord, string>;
  teams!: Table<Team, string>;
  appMetadata!: Table<MetadataRecord, string>;

  constructor() {
    super("tyloo-live-v1");

    this.version(1).stores({
      players: "id, teamId, number, active, updatedAt",
      matches: "id, status, date, updatedAt, teamId",
      matchPlayers: "[matchId+playerId], matchId, playerId, onField",
      events: "id, matchId, createdAt, status, type",
      clockStates: "matchId, updatedAt",
      syncQueue: "id, nextRetryAt, createdAt",
      settings: "key",
    });

    this.version(2)
      .stores({
        players: "id, teamId, number, active, updatedAt",
        matches: "id, status, date, updatedAt, teamId",
        matchPlayers: "[matchId+playerId], matchId, playerId, onField",
        events: "id, matchId, createdAt, status, type",
        clockStates: "matchId, updatedAt",
        syncQueue: null,
        settings: "key",
        teams: "id, updatedAt",
        appMetadata: "key",
      })
      .upgrade(async (transaction) => {
        const settingsRow = await transaction.table("settings").get(SETTING_KEYS.appSettings);
        const settings = (settingsRow?.value as AppSettings | undefined) ?? defaultAppSettings();
        const now = Date.now();
        const existingTeam = await transaction.table("teams").get(DEFAULT_TEAM_ID);
        if (!existingTeam) {
          await transaction.table("teams").put({
            id: DEFAULT_TEAM_ID,
            name: settings.teamName || DEFAULT_TEAM_NAME,
            logoDataUrl: settings.logoDataUrl ?? null,
            createdAt: now,
            updatedAt: now,
          } satisfies Team);
        }
        const metadata = transaction.table("appMetadata");
        await metadata.put({ key: METADATA_KEYS.schemaVersion, value: 2 });
        await metadata.put({ key: METADATA_KEYS.migratedAt, value: now });
      });

    this.version(3)
      .stores({
        matchRuntimeStates: "matchId, updatedAt",
      })
      .upgrade(async (transaction) => {
        const now = Date.now();
        const matches = (await transaction.table("matches").toArray()) as Array<{
          id: string;
          currentPeriod?: number;
          startingGoalkeeperId?: string | null;
        }>;
        const matchPlayers = transaction.table("matchPlayers");
        const runtimes = transaction.table("matchRuntimeStates");
        for (const match of matches) {
          const existing = await runtimes.get(match.id);
          if (existing) {
            continue;
          }
          const roster = (await matchPlayers.where("matchId").equals(match.id).toArray()) as MatchPlayer[];
          await runtimes.put({
            matchId: match.id,
            onFieldPlayerIds: roster.filter((player) => player.onField).map((player) => player.playerId),
            goalkeeperId: match.startingGoalkeeperId ?? "",
            period: match.currentPeriod ?? 1,
            updatedAt: now,
          } satisfies MatchRuntimeState);
        }
        await transaction.table("appMetadata").put({ key: METADATA_KEYS.schemaVersion, value: 3 });
        await transaction.table("appMetadata").put({ key: METADATA_KEYS.migratedAt, value: now });
      });

    this.version(4)
      .stores({
        formationSnapshots: "id, matchId, period, createdAt",
        formationPresets: "id, half, updatedAt",
        lineupDrafts: "matchId, purpose, updatedAt",
      })
      .upgrade(async (transaction) => {
        const now = Date.now();
        const matches = (await transaction.table("matches").toArray()) as Match[];
        for (const match of matches) {
          if (match.phase && match.clockMode) {
            continue;
          }
          await transaction.table("matches").put({
            ...match,
            phase: match.phase ?? matchPhaseFromClock(match.clock.phase, match.clock.period),
            clockMode: match.clockMode ?? "cumulative",
            periodDurationsMs: match.periodDurationsMs ?? [],
            updatedAt: now,
          } satisfies Match);
        }
        const runtimes = (await transaction.table("matchRuntimeStates").toArray()) as MatchRuntimeState[];
        for (const runtime of runtimes) {
          if (runtime.formationSnapshotId !== undefined) {
            continue;
          }
          await transaction.table("matchRuntimeStates").put({
            ...runtime,
            formationSnapshotId: "",
          } satisfies MatchRuntimeState);
        }
        const presets = transaction.table("formationPresets");
        if ((await presets.count()) === 0) {
          await presets.bulkPut([defaultFirstHalfPreset(now), defaultSecondHalfPreset(now)]);
        }
        await transaction.table("appMetadata").put({ key: METADATA_KEYS.schemaVersion, value: 4 });
        await transaction.table("appMetadata").put({ key: METADATA_KEYS.migratedAt, value: now });
      });

    this.version(5).upgrade(async (transaction) => {
      const now = Date.now();
      const matches = (await transaction.table("matches").toArray()) as Match[];
      for (const match of matches) {
        await transaction.table("matches").put({
          ...match,
          phase: match.phase ?? matchPhaseFromClock(match.clock.phase, match.clock.period),
          clockMode: match.clockMode ?? "cumulative",
          startingFormation: match.startingFormation == null
            ? match.startingFormation
            : normalizeFormationType(String(match.startingFormation)),
          periodDurationsMs: match.periodDurationsMs ?? [],
          updatedAt: now,
        } satisfies Match);
      }
      const snapshots = (await transaction.table("formationSnapshots").toArray()) as Array<
        FormationSnapshot & { status?: FormationSnapshot["status"]; formation: string }
      >;
      for (const snapshot of snapshots) {
        await transaction.table("formationSnapshots").put({
          ...snapshot,
          formation: normalizeFormationType(snapshot.formation),
          status: snapshot.status ?? "ACTIVE",
        } satisfies FormationSnapshot);
      }
      const presets = (await transaction.table("formationPresets").toArray()) as FormationPreset[];
      for (const preset of presets) {
        const formation = normalizeFormationType(String(preset.formation));
        if (formation !== preset.formation) {
          await transaction.table("formationPresets").put({ ...preset, formation } satisfies FormationPreset);
        }
      }
      const drafts = (await transaction.table("lineupDrafts").toArray()) as LineupDraft[];
      for (const draft of drafts) {
        const formation = normalizeFormationType(String(draft.formation));
        if (formation !== draft.formation) {
          await transaction.table("lineupDrafts").put({ ...draft, formation } satisfies LineupDraft);
        }
      }
      await transaction.table("appMetadata").put({ key: METADATA_KEYS.schemaVersion, value: 5 });
      await transaction.table("appMetadata").put({ key: METADATA_KEYS.migratedAt, value: now });
    });
  }
}

export const db = new TylooDatabase();

export const SETTING_KEYS = {
  deviceId: "deviceId",
  deviceName: "deviceName",
  helpSeen: "helpSeen",
  appSettings: "appSettings",
  lastFullBackupAt: "lastFullBackupAt",
} as const;

export const METADATA_KEYS = {
  schemaVersion: "schemaVersion",
  migratedAt: "migratedAt",
  initializedAt: "initializedAt",
  persistentStorage: "persistentStorage",
} as const;

export function defaultAppSettings(): AppSettings {
  return {
    teamName: DEFAULT_TEAM_NAME,
    logoDataUrl: null,
    defaultPeriodCount: 2,
    defaultPeriodLengthMs: 20 * 60 * 1000,
    deviceName: "Match iPad",
    firstUseHelpSeen: false,
    keepAwake: true,
    updatedAt: Date.now(),
  };
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return (row?.value as T | undefined) ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getMetadata<T>(key: string, fallback: T): Promise<T> {
  const row = await db.appMetadata.get(key);
  return (row?.value as T | undefined) ?? fallback;
}

export async function setMetadata(key: string, value: unknown): Promise<void> {
  await db.appMetadata.put({ key, value });
}

export async function getAppSettings(): Promise<AppSettings> {
  const stored = await getSetting<AppSettings | null>(SETTING_KEYS.appSettings, null);
  if (!stored) {
    return defaultAppSettings();
  }
  return {
    ...defaultAppSettings(),
    ...stored,
    keepAwake: stored.keepAwake ?? true,
  };
}

export function isStorageFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  return (
    name === "QuotaExceededError" ||
    name === "InvalidStateError" ||
    name === "UnknownError" ||
    name === "AbortError"
  );
}
