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
    status: "NOT_STARTED",
    periodCount: 2,
    periodLengthMs: 1_200_000,
    currentPeriod: 1,
    clock: { running: false, accumulatedMs: 0, lastStartedAt: null, period: 1, phase: "NOT_STARTED" },
    createdAt: 1,
    updatedAt: 1,
    startedAt: null,
    finishedAt: null,
  };
}

describe("MatchClockService persistence", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.settings.put({ key: "deviceId", value: createId() });
    await db.matches.put(seedMatch());
  });

  afterEach(async () => {
    await db.delete();
  });

  it("persists start/pause/resume and reconstructs elapsed time", async () => {
    await clockService.transition(matchId, "START", 10_000);
    await clockService.transition(matchId, "PAUSE", 20_000);
    const paused = await clockService.getClock(matchId);
    expect(paused.accumulatedMs).toBe(10_000);
    expect(paused.running).toBe(false);

    await clockService.transition(matchId, "RESUME", 40_000);
    const running = await clockService.getClock(matchId);
    expect(clockService.displayedMs(running, 50_000)).toBe(20_000);
  });

  it("moves to half-time on period end", async () => {
    await clockService.transition(matchId, "START", 0);
    await clockService.transition(matchId, "END_PERIOD", 1_200_000);
    const clock = await clockService.getClock(matchId);
    expect(clock.phase).toBe("HALFTIME");
    expect(clock.period).toBe(1);
  });
});
