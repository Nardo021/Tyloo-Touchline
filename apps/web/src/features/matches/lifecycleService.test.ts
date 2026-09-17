import {
  applyDefaultFirstHalfPreset,
  createId,
  DEFAULT_TEAM_ID,
  remapSlotsToFormation,
  type Player,
} from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { setDeviceName } from "../../lib/device";
import { lifecycleService } from "./lifecycleService";
import { matchService } from "./matchService";

const ids = {
  maxwell: "10000000-0000-4000-8000-000000000006",
  leo: "10000000-0000-4000-8000-000000000011",
  allen: "10000000-0000-4000-8000-000000000009",
  bobby: "10000000-0000-4000-8000-000000000010",
  david: "10000000-0000-4000-8000-000000000008",
  michael: "10000000-0000-4000-8000-000000000007",
  adam: "10000000-0000-4000-8000-000000000005",
  benjamin: "10000000-0000-4000-8000-000000000018",
};

const squad = Object.values(ids);
const playersByNumber = [
  { id: ids.maxwell, number: 6 },
  { id: ids.leo, number: 11 },
  { id: ids.allen, number: 9 },
  { id: ids.bobby, number: 10 },
  { id: ids.david, number: 8 },
  { id: ids.michael, number: 7 },
  { id: ids.adam, number: 5 },
  { id: ids.benjamin, number: 18 },
];

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

async function seedPlayers() {
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
}

function firstHalfLineup() {
  return applyDefaultFirstHalfPreset(playersByNumber);
}

describe("match lifecycle", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedPlayers();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("starts the first half with phase, period, snapshot, and goalkeeper", async () => {
    const lineup = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: lineup.onFieldPlayerIds,
      goalkeeperId: lineup.goalkeeperId,
      formation: lineup.formation,
      slots: lineup.slots,
    });
    expect(match.phase).toBe("PRE_MATCH");
    const started = await lifecycleService.startFirstHalf({
      matchId: match.id,
      formation: lineup.formation,
      slots: lineup.slots,
      now: 10_000,
    });
    expect(started.match.phase).toBe("FIRST_HALF");
    expect(started.match.clock.period).toBe(1);
    expect(started.match.clock.running).toBe(true);
    expect(started.runtime.goalkeeperId).toBe(ids.maxwell);
    expect(started.snapshot?.formation).toBe("2-1-2");
    const stored = await db.formationSnapshots.where("matchId").equals(match.id).toArray();
    expect(stored).toHaveLength(1);
  });

  it("ends the first half into HALF_TIME without starting the second half", async () => {
    const lineup = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: lineup.onFieldPlayerIds,
      goalkeeperId: lineup.goalkeeperId,
      formation: lineup.formation,
      slots: lineup.slots,
    });
    await lifecycleService.startFirstHalf({
      matchId: match.id,
      formation: lineup.formation,
      slots: lineup.slots,
      now: 0,
    });
    const ended = await lifecycleService.endFirstHalf(match.id, 20 * 60 * 1000 + 4_000);
    expect(ended.match.phase).toBe("HALF_TIME");
    expect(ended.match.clock.running).toBe(false);
    expect(ended.match.clock.period).toBe(1);
    expect(ended.match.periodDurationsMs?.[0]).toBe(20 * 60 * 1000 + 4_000);
    expect(ended.match.clock.phase).toBe("HALFTIME");
  });

  it("starts the second half from a 2-2-1 same-six lineup with formation and GK events only", async () => {
    const first = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: first.onFieldPlayerIds,
      goalkeeperId: first.goalkeeperId,
      formation: first.formation,
      slots: first.slots,
    });
    await lifecycleService.startFirstHalf({ matchId: match.id, formation: first.formation, slots: first.slots, now: 0 });
    await lifecycleService.endFirstHalf(match.id, 1_200_000);
    const secondSlots = remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael);
    const started = await lifecycleService.startSecondHalf({
      matchId: match.id,
      formation: "2-2-1",
      slots: secondSlots,
      pairs: [],
      now: 1_300_000,
    });
    const events = await db.events.where("matchId").equals(match.id).toArray();
    expect(started.match.phase).toBe("SECOND_HALF");
    expect(started.match.clock.period).toBe(2);
    expect(started.match.clock.accumulatedMs).toBe(0);
    expect(started.runtime.goalkeeperId).toBe(ids.michael);
    expect(events.filter((event) => event.type === "SUBSTITUTION")).toHaveLength(0);
    expect(events.filter((event) => event.type === "GOALKEEPER_CHANGE")).toHaveLength(1);
    expect(events.filter((event) => event.type === "FORMATION_CHANGE")).toHaveLength(1);
    expect(events.find((event) => event.type === "GOALKEEPER_CHANGE")?.period).toBe(2);
    expect(events.find((event) => event.type === "GOALKEEPER_CHANGE")?.matchTimeMs).toBe(0);
    expect(started.snapshot?.formation).toBe("2-2-1");
  });

  it("records a half-time substitution from Benjamin to David", async () => {
    const first = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: first.onFieldPlayerIds,
      goalkeeperId: first.goalkeeperId,
      formation: first.formation,
      slots: first.slots,
    });
    await lifecycleService.startFirstHalf({ matchId: match.id, formation: first.formation, slots: first.slots, now: 0 });
    await lifecycleService.endFirstHalf(match.id, 1_200_000);
    const nextSix = first.onFieldPlayerIds.map((id) => (id === ids.benjamin ? ids.david : id));
    const secondSlots = remapSlotsToFormation(first.slots, "2-2-1", nextSix, ids.michael);
    await lifecycleService.startSecondHalf({
      matchId: match.id,
      formation: "2-2-1",
      slots: secondSlots,
      pairs: [{ playerOffId: ids.benjamin, playerOnId: ids.david }],
      now: 1_300_000,
    });
    const events = await db.events.where("matchId").equals(match.id).toArray();
    const sub = events.find((event) => event.type === "SUBSTITUTION");
    expect(sub).toMatchObject({ playerOffId: ids.benjamin, playerOnId: ids.david, period: 2, matchTimeMs: 0 });
  });

  it("ends the match into FULL_TIME and keeps first-half duration", async () => {
    const first = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: first.onFieldPlayerIds,
      goalkeeperId: first.goalkeeperId,
      formation: first.formation,
      slots: first.slots,
    });
    await lifecycleService.startFirstHalf({ matchId: match.id, formation: first.formation, slots: first.slots, now: 0 });
    await lifecycleService.endFirstHalf(match.id, 1_200_000);
    const secondSlots = remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael);
    await lifecycleService.startSecondHalf({
      matchId: match.id,
      formation: "2-2-1",
      slots: secondSlots,
      pairs: [],
      now: 1_300_000,
    });
    const ended = await lifecycleService.endMatch(match.id, 1_300_000 + 20 * 60 * 1000 + 31_000);
    expect(ended.match.phase).toBe("FULL_TIME");
    expect(ended.match.status).toBe("FINISHED");
    expect(ended.match.periodDurationsMs?.[0]).toBe(1_200_000);
    expect(ended.match.periodDurationsMs?.[1]).toBe(20 * 60 * 1000 + 31_000);
    expect((await matchService.active())?.id).not.toBe(match.id);
  });

  it("restores a half-time draft after the database is reopened", async () => {
    const first = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: first.onFieldPlayerIds,
      goalkeeperId: first.goalkeeperId,
      formation: first.formation,
      slots: first.slots,
    });
    await lifecycleService.startFirstHalf({ matchId: match.id, formation: first.formation, slots: first.slots, now: 0 });
    await lifecycleService.endFirstHalf(match.id, 1_200_000);
    await lifecycleService.saveDraft({
      matchId: match.id,
      purpose: "HALF_TIME",
      formation: "2-2-1",
      slots: remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael),
      onFieldPlayerIds: first.onFieldPlayerIds,
      goalkeeperId: ids.michael,
      updatedAt: Date.now(),
    });
    db.close();
    await db.open();
    const restored = await lifecycleService.getDraft(match.id);
    const storedMatch = await db.matches.get(match.id);
    expect(storedMatch?.phase).toBe("HALF_TIME");
    expect(restored?.formation).toBe("2-2-1");
    expect(restored?.goalkeeperId).toBe(ids.michael);
  });

  it("reconstructs a running second-half clock after reopen", async () => {
    const first = firstHalfLineup();
    const match = await matchService.create({
      opponent: "Riverside",
      competition: "NSFA Summer",
      date: "2026-09-17",
      periodCount: 2,
      periodLengthMs: 1_200_000,
      squadIds: squad,
      starterIds: first.onFieldPlayerIds,
      goalkeeperId: first.goalkeeperId,
      formation: first.formation,
      slots: first.slots,
    });
    await lifecycleService.startFirstHalf({ matchId: match.id, formation: first.formation, slots: first.slots, now: 0 });
    await lifecycleService.endFirstHalf(match.id, 1_200_000);
    const secondSlots = remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael);
    await lifecycleService.startSecondHalf({
      matchId: match.id,
      formation: "2-2-1",
      slots: secondSlots,
      pairs: [],
      now: 2_000_000,
    });
    db.close();
    await db.open();
    const stored = await db.matches.get(match.id);
    expect(stored?.phase).toBe("SECOND_HALF");
    expect(stored?.clock.period).toBe(2);
    expect(stored?.clock.running).toBe(true);
    expect(stored?.clock.lastStartedAt).toBe(2_000_000);
  });
});
