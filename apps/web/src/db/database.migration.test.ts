import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./database";
import { DEFAULT_TEAM_ID } from "@tyloo/shared";

const playerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Dexie schema migration", () => {
  afterEach(async () => {
    await db.delete();
  });

  it("keeps existing players and matches when upgrading from schema v1", async () => {
    await Dexie.delete("tyloo-live-v1");
    const legacy = new Dexie("tyloo-live-v1");
    legacy.version(1).stores({
      players: "id, teamId, number, active, updatedAt",
      matches: "id, status, date, updatedAt, teamId",
      matchPlayers: "[matchId+playerId], matchId, playerId, onField",
      events: "id, matchId, createdAt, status, type",
      clockStates: "matchId, updatedAt",
      syncQueue: "id, nextRetryAt, createdAt",
      settings: "key",
    });
    await legacy.open();
    await legacy.table("players").put({
      id: playerId,
      teamId: DEFAULT_TEAM_ID,
      number: 11,
      name: "Leo",
      position: "FWD",
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await legacy.table("matches").put({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      teamId: DEFAULT_TEAM_ID,
      opponent: "Northside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      status: "FINISHED",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      currentPeriod: 2,
      clock: { running: false, accumulatedMs: 1000, lastStartedAt: null, period: 2, phase: "FINISHED" },
      createdAt: 1,
      updatedAt: 1,
      startedAt: 1,
      finishedAt: 2,
    });
    await legacy.table("settings").put({
      key: "appSettings",
      value: {
        teamName: "Tyloo FC",
        logoDataUrl: null,
        defaultPeriodCount: 2,
        defaultPeriodLengthMs: 1_200_000,
        deviceName: "Match iPad",
        firstUseHelpSeen: true,
        updatedAt: 1,
      },
    });
    legacy.close();

    await db.open();
    expect((await db.players.get(playerId))?.name).toBe("Leo");
    const migrated = await db.matches.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(migrated?.opponent).toBe("Northside");
    expect(migrated?.phase).toBe("FULL_TIME");
    expect(migrated?.clockMode).toBe("cumulative");
    expect((await db.teams.get(DEFAULT_TEAM_ID))?.name).toBe("Tyloo FC");
    const runtime = await db.matchRuntimeStates.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(runtime?.matchId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
});
