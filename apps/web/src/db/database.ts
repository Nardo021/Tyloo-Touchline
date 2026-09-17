import {
  DEFAULT_TEAM_ID,
  DEFAULT_TEAM_NAME,
  type AppSettings,
  type ClockStateRecord,
  type Match,
  type MatchEvent,
  type MatchPlayer,
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
