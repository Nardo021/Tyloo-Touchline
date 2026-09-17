import { BACKUP_FORMAT, BACKUP_VERSION, createId, DEFAULT_TEAM_ID, type Match, type Player } from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, defaultAppSettings, SETTING_KEYS, setSetting } from "../../db/database";
import { backupService } from "./backupService";

const leoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const matchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function player(): Player {
  return {
    id: leoId,
    teamId: DEFAULT_TEAM_ID,
    number: 11,
    name: "Leo",
    position: "FWD",
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function match(): Match {
  return {
    id: matchId,
    teamId: DEFAULT_TEAM_ID,
    opponent: "Northside",
    competition: "NSFA Summer",
    date: "2026-09-17",
    status: "FINISHED",
    phase: "FULL_TIME",
    clockMode: "period-local",
    periodCount: 2,
    periodLengthMs: 1_200_000,
    currentPeriod: 2,
    clock: { running: false, accumulatedMs: 2_400_000, lastStartedAt: null, period: 2, phase: "FINISHED" },
    createdAt: 1,
    updatedAt: 1,
    startedAt: 1,
    finishedAt: 2,
  };
}

describe("BackupService", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await setSetting(SETTING_KEYS.appSettings, defaultAppSettings());
    await db.teams.put({
      id: DEFAULT_TEAM_ID,
      name: "Tyloo FC",
      logoDataUrl: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.players.put(player());
    await db.matches.put(match());
    await db.events.put({
      id: createId(),
      matchId,
      type: "GOAL",
      playerId: leoId,
      assistPlayerId: null,
      period: 1,
      matchTimeMs: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      deviceId: createId(),
      status: "ACTIVE",
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it("exports a versioned backup and restores it after the database is cleared", async () => {
    const { json, backup } = await backupService.exportAll();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.data.players[0]?.name).toBe("Leo");

    await db.players.clear();
    await db.matches.clear();
    await db.events.clear();
    expect(await db.players.count()).toBe(0);

    const inspected = backupService.inspect(json);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    await backupService.restore(inspected.backup);
    expect((await db.players.get(leoId))?.name).toBe("Leo");
    expect((await db.matches.get(matchId))?.opponent).toBe("Northside");
    expect(await db.events.count()).toBe(1);
  });

  it("rejects a bad version and malformed backups", () => {
    expect(backupService.inspect("not-json").ok).toBe(false);
    expect(backupService.inspect(JSON.stringify({ format: "other", version: 1 })).ok).toBe(false);
    expect(backupService.inspect(JSON.stringify({ format: BACKUP_FORMAT, version: 99 })).ok).toBe(false);
  });

  it("exports match JSON and CSV", async () => {
    const json = await backupService.exportMatch(matchId);
    const csv = await backupService.exportMatchCsv(matchId);
    expect(json?.filename).toContain("northside");
    expect(csv?.csv).toContain("GOAL");
    expect(csv?.csv).toContain("Leo");
  });
});
