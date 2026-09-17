import { DEFAULT_TEAM_ID, type Match, type Player } from "@tyloo/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { LocalWriteError } from "../../lib/localWrite";
import { playerService } from "./playerService";

const playerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const matchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function player(active: boolean): Player {
  return {
    id: playerId,
    teamId: DEFAULT_TEAM_ID,
    number: 3,
    name: "Chris",
    position: null,
    active,
    createdAt: 1,
    updatedAt: 1,
  };
}

function unfinishedMatch(): Match {
  return {
    id: matchId,
    teamId: DEFAULT_TEAM_ID,
    opponent: "Northside",
    competition: "NSFA Summer",
    date: "2026-09-18",
    status: "RUNNING",
    phase: "FIRST_HALF",
    clockMode: "period-local",
    periodCount: 2,
    periodLengthMs: 1_200_000,
    currentPeriod: 1,
    clock: { running: true, accumulatedMs: 0, lastStartedAt: 1, period: 1, phase: "RUNNING" },
    createdAt: 1,
    updatedAt: 1,
    startedAt: 1,
    finishedAt: null,
  };
}

describe("PlayerService.remove", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("refuses to delete an active player", async () => {
    await db.players.put(player(true));

    await expect(playerService.remove(playerId)).rejects.toBeInstanceOf(LocalWriteError);
    expect(await db.players.get(playerId)).toMatchObject({ name: "Chris" });
  });

  it("deletes an inactive player", async () => {
    await db.players.put(player(false));

    await playerService.remove(playerId);

    expect(await db.players.get(playerId)).toBeUndefined();
  });

  it("refuses to delete an inactive player still in an unfinished match", async () => {
    await db.players.put(player(false));
    await db.matches.put(unfinishedMatch());
    await db.matchPlayers.put({
      matchId,
      playerId,
      starter: true,
      onField: true,
      createdAt: 1,
      updatedAt: 1,
    });

    await expect(playerService.remove(playerId)).rejects.toBeInstanceOf(LocalWriteError);
    expect(await db.players.get(playerId)).toMatchObject({ name: "Chris" });
  });

  it("deletes an inactive player after their matches are finished", async () => {
    await db.players.put(player(false));
    await db.matches.put({
      ...unfinishedMatch(),
      status: "FINISHED",
      phase: "FULL_TIME",
      clock: { running: false, accumulatedMs: 1_200_000, lastStartedAt: null, period: 1, phase: "FINISHED" },
      finishedAt: 2,
    });
    await db.matchPlayers.put({
      matchId,
      playerId,
      starter: true,
      onField: true,
      createdAt: 1,
      updatedAt: 1,
    });

    await playerService.remove(playerId);

    expect(await db.players.get(playerId)).toBeUndefined();
  });
});
