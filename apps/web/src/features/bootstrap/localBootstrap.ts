import {
  createId,
  DEFAULT_TEAM_ID,
  DEFAULT_TEAM_NAME,
  type Player,
  type Team,
} from "@tyloo/shared";
import {
  db,
  getAppSettings,
  METADATA_KEYS,
  SETTING_KEYS,
  setMetadata,
  setSetting,
} from "../../db/database";
import { DEFAULT_SQUAD } from "../../seed-data";
import { getDeviceId } from "../../lib/device";
import { storageService } from "../storage/storageService";

export interface BootstrapResult {
  databaseReady: boolean;
  writable: boolean;
  team: Team | null;
  playerCount: number;
}

let bootstrapPromise: Promise<BootstrapResult> | null = null;

export function bootstrapLocalApp(): Promise<BootstrapResult> {
  bootstrapPromise ??= runBootstrap();
  return bootstrapPromise;
}

async function runBootstrap(): Promise<BootstrapResult> {
  await db.open();
  const settings = await getAppSettings();
  await setSetting(SETTING_KEYS.appSettings, settings);
  await getDeviceId();

  const now = Date.now();
  let team = (await db.teams.get(DEFAULT_TEAM_ID)) ?? (await db.teams.toCollection().first()) ?? null;
  if (!team) {
    team = {
      id: DEFAULT_TEAM_ID,
      name: settings.teamName || DEFAULT_TEAM_NAME,
      logoDataUrl: settings.logoDataUrl,
      createdAt: now,
      updatedAt: now,
    };
    await db.teams.put(team);
  }

  const playerCount = await db.players.count();
  if (playerCount === 0) {
    const players: Player[] = DEFAULT_SQUAD.map((entry) => ({
      id: createId(),
      teamId: team.id,
      number: entry.number,
      name: entry.name,
      position: entry.position,
      active: true,
      createdAt: now,
      updatedAt: now,
    }));
    await db.players.bulkPut(players);
  }

  const initializedAt = await db.appMetadata.get(METADATA_KEYS.initializedAt);
  if (!initializedAt) {
    await setMetadata(METADATA_KEYS.initializedAt, now);
    await storageService.persist();
  }

  const writable = await storageService.probeWritable();
  return {
    databaseReady: db.isOpen(),
    writable,
    team,
    playerCount: await db.players.count(),
  };
}
