import { createId, DEFAULT_TEAM_ID, type Match } from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { clockService } from "./clockService";

const matchId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function seedMatch(): Match {
  return {
    id: matchId,
    teamId: DEFAULT_TEAM_ID,
    opponent: "Riverside",
    competition: "NSFA Summer",
    date: "2026-09-17",
    status: "RUNNING",
    phase: "FIRST_HALF",
    clockMode: "period-local",
    periodCount: 2,
    periodLengthMs: 1_200_000,
    currentPeriod: 1,
    clock: { running: true, accumulatedMs: 0, lastStartedAt: 10_000, period: 1, phase: "RUNNING" },
    createdAt: 1,
    updatedAt: 1,
    startedAt: 10_000,
    finishedAt: null,
  };
}

describe("MatchClockService persistence", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.settings.put({ key: "deviceId", value: createId() });
    const match = seedMatch();
    await db.matches.put(match);
    await db.clockStates.put({ ...match.clock, matchId, updatedAt: 1 });
  });

  afterEach(async () => {
    await db.delete();
  });

  it("persists pause/resume without rewriting match phase", async () => {
    await clockService.transition(matchId, "PAUSE", 20_000);
    const paused = await clockService.getClock(matchId);
    expect(paused.accumulatedMs).toBe(10_000);
    expect(paused.running).toBe(false);
    expect((await db.matches.get(matchId))?.phase).toBe("FIRST_HALF");

    await clockService.transition(matchId, "RESUME", 40_000);
    const running = await clockService.getClock(matchId);
    expect(clockService.displayedMs(running, 50_000)).toBe(20_000);
    expect((await db.matches.get(matchId))?.phase).toBe("FIRST_HALF");
  });

  it("reconstructs a running clock after the database is reopened", async () => {
    db.close();
    await db.open();
    const clock = await clockService.getClock(matchId);
    expect(clock.running).toBe(true);
    expect(clock.lastStartedAt).toBe(10_000);
    expect(clockService.displayedMs(clock, 100_000)).toBe(90_000);
  });
});
