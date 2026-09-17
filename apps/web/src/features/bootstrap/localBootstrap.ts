import {
  createId,
  DEFAULT_TEAM_ID,
  DEFAULT_TEAM_NAME,
  DEFAULT_TYLOO_ROSTER,
  LEGACY_DEV_SQUAD,
  preferredRolesForNumber,
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

export function resetLocalBootstrapForTests(): void {
  bootstrapPromise = null;
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

  const existingPlayers = await db.players.toArray();
  if (existingPlayers.length === 0) {
    const players: Player[] = DEFAULT_TYLOO_ROSTER.map((entry) => ({
      id: createId(),
      teamId: team.id,
      number: entry.number,
      name: entry.name,
      position: null,
      preferredRoles: preferredRolesForNumber(entry.number),
      active: true,
      createdAt: now,
      updatedAt: now,
    }));
    await db.players.bulkPut(players);
  } else if (isLegacyDevelopmentSeed(existingPlayers)) {
    await migrateLegacyDevelopmentSeed(existingPlayers, team.id, now);
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

function isLegacyDevelopmentSeed(players: Player[]): boolean {
  if (players.length !== LEGACY_DEV_SQUAD.length) {
    return false;
  }
  const expected = new Set(LEGACY_DEV_SQUAD.map((entry) => `${entry.number}:${entry.name}`));
  return players.every((player) => expected.has(`${player.number}:${player.name}`));
}

const LEGACY_KEEP_NUMBERS: Record<string, number> = {
  Benjamin: 18,
  Maxwell: 6,
  Leo: 11,
};

async function migrateLegacyDevelopmentSeed(players: Player[], teamId: string, now: number): Promise<void> {
  const next: Player[] = players.map((player) => {
    const nextNumber = LEGACY_KEEP_NUMBERS[player.name];
    if (nextNumber !== undefined) {
      return {
        ...player,
        number: nextNumber,
        position: null,
        active: true,
        updatedAt: now,
      };
    }
    return {
      ...player,
      position: null,
      active: false,
      updatedAt: now,
    };
  });

  const activeNames = new Set(next.filter((player) => player.active).map((player) => player.name));
  for (const entry of DEFAULT_TYLOO_ROSTER) {
    if (activeNames.has(entry.name)) {
      continue;
    }
    next.push({
      id: createId(),
      teamId,
      number: entry.number,
      name: entry.name,
      position: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.players.bulkPut(next);
}
