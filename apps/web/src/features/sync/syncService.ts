import {
  matchEventSchema,
  matchPlayerSchema,
  matchSchema,
  playerSchema,
  settingsSchema,
  teamSchema,
  type RemoteChange,
  type SyncRequest,
  type SyncResponse,
} from "@tyloo/shared";
import { db, defaultAppSettings, getSetting, SETTING_KEYS, setSetting } from "../../db/database";
import { apiGet, apiPost, ApiError } from "../../lib/api";
import { getDeviceId, getDeviceName } from "../../lib/device";
import { backoffMs, dueItems, enqueueMutation, markAttempt, pendingCount, removeAccepted } from "./syncQueue";

export type ConnectionState = "synced" | "syncing" | "offline" | "server_unavailable";

export interface SyncStatus {
  state: ConnectionState;
  pending: number;
  lastError: string | null;
}

const listeners = new Set<(status: SyncStatus) => void>();
let current: SyncStatus = { state: "offline", pending: 0, lastError: null };
let inFlight = false;
let started = false;

function emit(next: Partial<SyncStatus>): void {
  current = { ...current, ...next };
  for (const listener of listeners) {
    listener(current);
  }
}

export function subscribeSync(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncStatus(): SyncStatus {
  return current;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const result = await apiGet<{ ok: boolean }>("/api/health");
    const ok = result.ok === true;
    await setSetting(SETTING_KEYS.lastHealthOk, ok);
    return ok;
  } catch {
    await setSetting(SETTING_KEYS.lastHealthOk, false);
    return false;
  }
}

export async function applyRemoteChange(change: RemoteChange): Promise<void> {
  switch (change.entity) {
    case "team": {
      const team = teamSchema.parse(change.payload);
      const settings = await getSetting(SETTING_KEYS.appSettings, defaultAppSettings());
      await setSetting(SETTING_KEYS.appSettings, { ...settings, teamName: team.name, updatedAt: team.updatedAt });
      return;
    }
    case "player":
      await db.players.put(playerSchema.parse(change.payload));
      return;
    case "match":
      await db.matches.put(matchSchema.parse(change.payload));
      return;
    case "match_player":
      await db.matchPlayers.put(matchPlayerSchema.parse(change.payload));
      return;
    case "event":
      await db.events.put(matchEventSchema.parse(change.payload));
      return;
    case "settings":
      await setSetting(SETTING_KEYS.appSettings, settingsSchema.parse(change.payload));
      return;
    case "match_deleted": {
      const matchId = String((change.payload as { matchId?: string }).matchId ?? change.entityId);
      await db.matches.delete(matchId);
      await db.matchPlayers.where("matchId").equals(matchId).delete();
      await db.events.where("matchId").equals(matchId).delete();
      await db.clockStates.delete(matchId);
      return;
    }
    default: {
      const _exhaustive: never = change.entity;
      void _exhaustive;
    }
  }
}

export async function flushSync(): Promise<void> {
  if (inFlight) {
    return;
  }
  inFlight = true;
  emit({ state: "syncing", pending: await pendingCount() });
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      emit({ state: "offline", pending: await pendingCount() });
      return;
    }
    const healthy = await checkHealth();
    if (!healthy) {
      emit({
        state: navigator.onLine ? "server_unavailable" : "offline",
        pending: await pendingCount(),
      });
      return;
    }

    const items = await dueItems();
    const lastServerCursor = await getSetting(SETTING_KEYS.lastServerCursor, 0);
    const request: SyncRequest = {
      deviceId: await getDeviceId(),
      deviceName: await getDeviceName(),
      lastServerCursor,
      mutations: items.map((item) => item.mutation),
    };
    const response = await apiPost<SyncResponse>("/api/sync", request);
    await removeAccepted(response.accepted);
    for (const rejected of response.rejected) {
      await markAttempt(rejected.id, rejected.reason, Date.now() + backoffMs(3));
    }
    for (const change of response.remoteChanges) {
      await applyRemoteChange(change);
    }
    await setSetting(SETTING_KEYS.lastServerCursor, response.serverCursor);
    const pending = await pendingCount();
    emit({
      state: pending === 0 ? "synced" : "syncing",
      pending,
      lastError: response.rejected[0]?.reason ?? null,
    });
  } catch (error) {
    const items = await dueItems();
    for (const item of items) {
      await markAttempt(item.id, error instanceof Error ? error.message : "Sync failed", Date.now() + backoffMs(item.attempts + 1));
    }
    const pending = await pendingCount();
    const state = error instanceof ApiError && error.status === 401
      ? "server_unavailable"
      : navigator.onLine
        ? "server_unavailable"
        : "offline";
    emit({
      state,
      pending,
      lastError: error instanceof Error ? error.message : "Sync failed",
    });
  } finally {
    inFlight = false;
  }
}

export async function bootstrapFromServer(): Promise<void> {
  try {
    const snapshot = await apiGet<{
      players: unknown[];
      matches: unknown[];
      matchPlayers: unknown[];
      events: unknown[];
      settings: unknown;
    }>("/api/bootstrap");
    if (Array.isArray(snapshot.players)) {
      await db.players.bulkPut(snapshot.players.map((item) => playerSchema.parse(item)));
    }
    if (Array.isArray(snapshot.matches)) {
      await db.matches.bulkPut(snapshot.matches.map((item) => matchSchema.parse(item)));
    }
    if (Array.isArray(snapshot.matchPlayers)) {
      await db.matchPlayers.bulkPut(snapshot.matchPlayers.map((item) => matchPlayerSchema.parse(item)));
    }
    if (Array.isArray(snapshot.events)) {
      await db.events.bulkPut(snapshot.events.map((item) => matchEventSchema.parse(item)));
    }
    if (snapshot.settings) {
      await setSetting(SETTING_KEYS.appSettings, settingsSchema.parse(snapshot.settings));
    }
  } catch {
    // Local data remains the source of truth.
  }
}

export function startSyncRuntime(): void {
  if (started || typeof window === "undefined") {
    return;
  }
  started = true;
  void flushSync();
  window.setInterval(() => {
    void flushSync();
  }, 5_000);
  window.addEventListener("online", () => {
    void flushSync();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void flushSync();
    }
  });
}

export function requestSync(): void {
  void flushSync();
}

export async function queueAndSync(mutationWriter: () => Promise<void>): Promise<void> {
  await mutationWriter();
  requestSync();
}

export { enqueueMutation };
