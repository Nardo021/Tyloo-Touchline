import { describe, expect, it } from "vitest";
import { applySubstitutionToSquad, revertSubstitutionOnSquad, type MatchPlayer } from "./models.js";

const off: MatchPlayer = {
  matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  playerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  starter: true,
  onField: true,
  createdAt: 1,
  updatedAt: 1,
};

const on: MatchPlayer = {
  matchId: off.matchId,
  playerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  starter: false,
  onField: false,
  createdAt: 1,
  updatedAt: 1,
};

describe("substitution roster updates", () => {
  it("moves the outgoing player off and the incoming player on", () => {
    const next = applySubstitutionToSquad([off, on], off.playerId, on.playerId, 9);
    expect(next.find((player) => player.playerId === off.playerId)?.onField).toBe(false);
    expect(next.find((player) => player.playerId === on.playerId)?.onField).toBe(true);
  });

  it("reverts a voided substitution", () => {
    const applied = applySubstitutionToSquad([off, on], off.playerId, on.playerId, 9);
    const reverted = revertSubstitutionOnSquad(applied, off.playerId, on.playerId, 10);
    expect(reverted.find((player) => player.playerId === off.playerId)?.onField).toBe(true);
    expect(reverted.find((player) => player.playerId === on.playerId)?.onField).toBe(false);
  });
});
