import { db } from "../db/database";
import { bootstrapLocalApp } from "../features/bootstrap/localBootstrap";
import { storageService } from "../features/storage/storageService";
import { wakeLockService } from "../lib/wakeLock";

export interface OfflineReadiness {
  serviceWorkerInstalled: boolean;
  serviceWorkerControlling: boolean;
  databaseReady: boolean;
  databaseWritable: boolean;
  teamLoaded: boolean;
  playersLoaded: boolean;
  wakeLockSupported: boolean;
  offlineReady: boolean;
  canStartMatch: boolean;
}

let shellCached = false;

export function markAppShellCached(): void {
  shellCached = true;
}

export function isAppShellCached(): boolean {
  return shellCached || isServiceWorkerControlling();
}

export function isServiceWorkerControlling(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller);
}

export function isServiceWorkerRegistered(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function evaluateReadiness(): Promise<OfflineReadiness> {
  let databaseReady = false;
  let databaseWritable = false;
  let teamLoaded = false;
  let playersLoaded = false;
  try {
    await bootstrapLocalApp();
    await db.open();
    databaseReady = db.isOpen();
    databaseWritable = await storageService.probeWritable();
    teamLoaded = (await db.teams.count()) > 0;
    const players = await db.players.toArray();
    playersLoaded = players.some((player) => player.active);
  } catch {
    databaseReady = false;
    databaseWritable = false;
  }

  const serviceWorkerControlling = isServiceWorkerControlling();
  const serviceWorkerInstalled = shellCached || serviceWorkerControlling;
  const canStartMatch = databaseReady && databaseWritable && teamLoaded && playersLoaded;
  return {
    serviceWorkerInstalled,
    serviceWorkerControlling,
    databaseReady,
    databaseWritable,
    teamLoaded,
    playersLoaded,
    wakeLockSupported: wakeLockService.supported(),
    offlineReady: serviceWorkerInstalled && canStartMatch,
    canStartMatch,
  };
}
