import {
  createId,
  DEFAULT_TEAM_ID,
  type Match,
  type MatchPlayer,
  type Player,
} from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { setDeviceName } from "../../lib/device";
import { clockService } from "../clock/clockService";
import { lineupService } from "./lineupService";

const matchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ids = {
  maxwell: "10000000-0000-4000-8000-000000000006",
  leo: "10000000-0000-4000-8000-000000000011",
  allen: "10000000-0000-4000-8000-000000000009",
  bobby: "10000000-0000-4000-8000-000000000010",
  david: "10000000-0000-4000-8000-000000000008",
  michael: "10000000-0000-4000-8000-000000000007",
  adam: "10000000-0000-4000-8000-000000000005",
  benjamin: "10000000-0000-4000-8000-000000000018",
} as const;

const squad: string[] = Object.values(ids);
const firstHalf: string[] = [ids.maxwell, ids.leo, ids.allen, ids.bobby, ids.david, ids.benjamin];

function player(id: string, number: number, name: string): Player {
  return {
    id,
    teamId: DEFAULT_TEAM_ID,
    number,
    name,
    position: null,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function match(status: Match["status"] = "RUNNING"): Match {
  return {
    id: matchId,
    teamId: DEFAULT_TEAM_ID,
    opponent: "Northside",
    competition: "NSFA Summer",
    date: "2026-09-17",
    status,
    phase: status === "HALFTIME" ? "HALF_TIME" : status === "RUNNING" ? "FIRST_HALF" : "PRE_MATCH",
    clockMode: "period-local",
    periodCount: 2,
    periodLengthMs: 1_200_000,
    currentPeriod: 1,
    clock: {
      running: status === "RUNNING",
      accumulatedMs: status === "HALFTIME" ? 1_200_000 : 0,
      lastStartedAt: status === "RUNNING" ? 1_000 : null,
      period: 1,
      phase: status === "HALFTIME" ? "HALFTIME" : status === "RUNNING" ? "RUNNING" : "NOT_STARTED",
    },
    createdAt: 1,
    updatedAt: 1,
    startedAt: 1,
    finishedAt: null,
    startingGoalkeeperId: ids.benjamin,
  };
}

function assignment(playerId: string, onField: boolean): MatchPlayer {
  return {
    matchId,
    playerId,
    starter: firstHalf.includes(playerId),
    onField,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function seed(status: Match["status"] = "RUNNING") {
  await setDeviceName("Test");
  await db.settings.put({ key: "deviceId", value: createId() });
  await db.players.bulkPut([
    player(ids.maxwell, 6, "Maxwell"),
    player(ids.leo, 11, "Leo"),
    player(ids.allen, 9, "Allen"),
    player(ids.bobby, 10, "Bobby"),
    player(ids.david, 8, "David"),
    player(ids.michael, 7, "Michael"),
    player(ids.adam, 5, "Adam"),
    player(ids.benjamin, 18, "Benjamin"),
  ]);
  await db.matches.put(match(status));
  await db.matchPlayers.bulkPut(squad.map((id) => assignment(id, firstHalf.includes(id))));
  await db.matchRuntimeStates.put({
    matchId,
    onFieldPlayerIds: firstHalf,
    goalkeeperId: ids.benjamin,
    period: 1,
    updatedAt: 1,
  });
  await db.clockStates.put({
    matchId,
    running: status === "RUNNING",
    accumulatedMs: status === "HALFTIME" ? 1_200_000 : 0,
    lastStartedAt: status === "RUNNING" ? 1_000 : null,
    period: 1,
    phase: status === "HALFTIME" ? "HALFTIME" : status === "RUNNING" ? "RUNNING" : "NOT_STARTED",
    updatedAt: 1,
  });
}

describe("LineupService", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seed();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("records a normal substitution atomically", async () => {
    const result = await lineupService.recordSubstitution(matchId, ids.leo, ids.adam);
    const runtime = await db.matchRuntimeStates.get(matchId);
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    expect(runtime?.onFieldPlayerIds).toHaveLength(6);
    expect(runtime?.onFieldPlayerIds).toContain(ids.adam);
    expect(runtime?.onFieldPlayerIds).not.toContain(ids.leo);
    expect(runtime?.goalkeeperId).toBe(ids.benjamin);
    expect(roster.find((item) => item.playerId === ids.leo)?.onField).toBe(false);
    expect(roster.find((item) => item.playerId === ids.adam)?.onField).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("SUBSTITUTION");
  });

  it("substitutes the current goalkeeper off and records both events", async () => {
    const result = await lineupService.recordSubstitution(matchId, ids.benjamin, ids.michael, ids.leo);
    const runtime = await db.matchRuntimeStates.get(matchId);
    expect(runtime?.onFieldPlayerIds).toContain(ids.michael);
    expect(runtime?.onFieldPlayerIds).not.toContain(ids.benjamin);
    expect(runtime?.goalkeeperId).toBe(ids.leo);
    expect(runtime?.onFieldPlayerIds).toHaveLength(6);
    expect(result.events.map((event) => event.type)).toEqual(["SUBSTITUTION", "GOALKEEPER_CHANGE"]);
  });

  it("lets the incoming substitute become goalkeeper immediately", async () => {
    const result = await lineupService.recordSubstitution(matchId, ids.benjamin, ids.michael, ids.michael);
    const runtime = await db.matchRuntimeStates.get(matchId);
    expect(runtime?.goalkeeperId).toBe(ids.michael);
    expect(runtime?.onFieldPlayerIds).toContain(ids.michael);
    expect(result.events.some((event) => event.type === "GOALKEEPER_CHANGE")).toBe(true);
  });

  it("changes goalkeeper without changing the six on the field", async () => {
    const result = await lineupService.recordGoalkeeperChange(matchId, ids.leo);
    const runtime = await db.matchRuntimeStates.get(matchId);
    expect(runtime?.onFieldPlayerIds).toEqual(firstHalf);
    expect(runtime?.goalkeeperId).toBe(ids.leo);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("GOALKEEPER_CHANGE");
  });

  it("starts the second half with derived substitutions and a goalkeeper change", async () => {
    await db.delete();
    await db.open();
    await seed("HALFTIME");
    const secondHalf = [ids.maxwell, ids.leo, ids.allen, ids.michael, ids.david, ids.adam];
    const result = await lineupService.startNextPeriod({
      matchId,
      nextOnFieldIds: secondHalf,
      nextGoalkeeperId: ids.leo,
      pairs: [
        { playerOffId: ids.bobby, playerOnId: ids.michael },
        { playerOffId: ids.benjamin, playerOnId: ids.adam },
      ],
      now: 1_200_000,
    });
    const runtime = await db.matchRuntimeStates.get(matchId);
    const storedMatch = await db.matches.get(matchId);
    const events = await db.events.where("matchId").equals(matchId).toArray();
    expect(runtime?.onFieldPlayerIds.sort()).toEqual([...secondHalf].sort());
    expect(runtime?.goalkeeperId).toBe(ids.leo);
    expect(storedMatch?.clock.period).toBe(2);
    expect(storedMatch?.clock.phase).toBe("RUNNING");
    expect(events.filter((event) => event.type === "SUBSTITUTION")).toHaveLength(2);
    expect(events.filter((event) => event.type === "GOALKEEPER_CHANGE")).toHaveLength(1);
    expect(result.runtime.period).toBe(2);
  });

  it("restores on-field, bench, and goalkeeper after the database is reopened", async () => {
    await lineupService.recordSubstitution(matchId, ids.leo, ids.adam);
    await lineupService.recordGoalkeeperChange(matchId, ids.allen);
    const before = await db.matchRuntimeStates.get(matchId);
    db.close();
    await db.open();
    const after = await db.matchRuntimeStates.get(matchId);
    const events = await db.events.where("matchId").equals(matchId).toArray();
    expect(after).toEqual(before);
    expect(after?.onFieldPlayerIds).toContain(ids.adam);
    expect(after?.goalkeeperId).toBe(ids.allen);
    expect(events.filter((event) => event.status === "ACTIVE")).toHaveLength(2);
  });

  it("only reverts the latest lineup change on undo", async () => {
    const first = await lineupService.recordSubstitution(matchId, ids.leo, ids.adam);
    const second = await lineupService.recordGoalkeeperChange(matchId, ids.allen);
    const firstEvent = first.events[0];
    const secondEvent = second.events[0];
    if (!firstEvent || !secondEvent) {
      throw new Error("expected events");
    }
    await lineupService.voidIfLatestLineupChange(firstEvent);
    const runtime = await db.matchRuntimeStates.get(matchId);
    expect(runtime?.goalkeeperId).toBe(ids.allen);
    await lineupService.voidIfLatestLineupChange(secondEvent);
    const reverted = await db.matchRuntimeStates.get(matchId);
    expect(reverted?.goalkeeperId).toBe(ids.benjamin);
    expect(reverted?.onFieldPlayerIds).toContain(ids.adam);
  });
});

describe("clock stays local after lineup writes", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seed("NOT_STARTED");
  });

  afterEach(async () => {
    await db.delete();
  });

  it("can still start and persist the clock", async () => {
    await clockService.transition(matchId, "START", 10_000);
    const clock = await clockService.getClock(matchId);
    expect(clock.running).toBe(true);
    expect(clock.lastStartedAt).toBe(10_000);
  });
});
