import { createId, DEFAULT_TEAM_ID, type Match, type MatchPlayer, type Player } from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { setDeviceName } from "../../lib/device";
import { eventService } from "./eventService";

const matchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const maxId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

function match(): Match {
  return {
    id: matchId,
    teamId: DEFAULT_TEAM_ID,
    opponent: "Northside",
    competition: "NSFA Summer",
    date: "2026-09-17",
    status: "RUNNING",
    periodCount: 2,
    periodLengthMs: 1_200_000,
    currentPeriod: 1,
    clock: { running: true, accumulatedMs: 0, lastStartedAt: 1_000, period: 1, phase: "RUNNING" },
    createdAt: 1,
    updatedAt: 1,
    startedAt: 1,
    finishedAt: null,
  };
}

function assignment(playerId: string, onField: boolean): MatchPlayer {
  return {
    matchId,
    playerId,
    starter: onField,
    onField,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("EventService", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await setDeviceName("Test");
    await db.settings.put({ key: "deviceId", value: createId() });
    await db.players.bulkPut([player(leoId, 11, "Leo"), player(maxId, 7, "Maxwell")]);
    await db.matches.put(match());
    await db.matchPlayers.bulkPut([assignment(leoId, true), assignment(maxId, false)]);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("persists a player event locally without waiting for the network", async () => {
    const event = await eventService.recordPlayerEvent({
      matchId,
      playerId: leoId,
      type: "GOAL",
      assistPlayerId: maxId,
    });
    const stored = await db.events.get(event.id);
    const queued = await db.syncQueue.toArray();
    expect(stored?.type).toBe("GOAL");
    expect(stored?.status).toBe("ACTIVE");
    expect(queued.some((item) => item.mutation.kind === "UPSERT_EVENT")).toBe(true);
  });

  it("voids an event instead of deleting it", async () => {
    const event = await eventService.recordPlayerEvent({
      matchId,
      playerId: leoId,
      type: "FOUL",
    });
    const voided = await eventService.voidEvent(event.id);
    expect(voided?.status).toBe("VOIDED");
    expect(await db.events.get(event.id)).toMatchObject({ status: "VOIDED" });
  });

  it("updates on-field players after a substitution", async () => {
    await eventService.recordSubstitution(matchId, leoId, maxId);
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    expect(roster.find((item) => item.playerId === leoId)?.onField).toBe(false);
    expect(roster.find((item) => item.playerId === maxId)?.onField).toBe(true);
  });
});
