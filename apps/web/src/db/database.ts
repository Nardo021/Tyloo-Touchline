import {
  type AppSettings,
  type Match,
  type MatchClockState,
  type MatchEvent,
  type MatchPlayer,
  type Mutation,
  type Player,
} from "@tyloo/shared";
import Dexie, { type Table } from "dexie";

export interface StoredClock extends MatchClockState {
  matchId: string;
  updatedAt: number;
}

export interface SyncQueueItem {
  id: string;
  mutation: Mutation;
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class TylooDatabase extends Dexie {
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  matchPlayers!: Table<MatchPlayer, [string, string]>;
  events!: Table<MatchEvent, string>;
  clockStates!: Table<StoredClock, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  settings!: Table<SettingRecord, string>;

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
  }
}

export const db = new TylooDatabase();

export const SETTING_KEYS = {
  deviceId: "deviceId",
  deviceName: "deviceName",
  sessionToken: "sessionToken",
  sessionExpiresAt: "sessionExpiresAt",
  helpSeen: "helpSeen",
  lastServerCursor: "lastServerCursor",
  appSettings: "appSettings",
  lastHealthOk: "lastHealthOk",
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return (row?.value as T | undefined) ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export function defaultAppSettings(): AppSettings {
  return {
    teamName: "Tyloo FC",
    logoDataUrl: null,
    defaultPeriodCount: 2,
    defaultPeriodLengthMs: 20 * 60 * 1000,
    deviceName: "Match iPad",
    firstUseHelpSeen: false,
    updatedAt: Date.now(),
  };
}
