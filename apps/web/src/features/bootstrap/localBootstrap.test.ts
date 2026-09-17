import { DEFAULT_TYLOO_ROSTER, LEGACY_DEV_SQUAD } from "@tyloo/shared";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { bootstrapLocalApp, resetLocalBootstrapForTests } from "./localBootstrap";

describe("local bootstrap roster", () => {
  afterEach(async () => {
    resetLocalBootstrapForTests();
    await db.delete();
  });

  it("seeds the Tyloo FC roster on a fresh install", async () => {
    await db.delete();
    const result = await bootstrapLocalApp();
    const players = await db.players.toArray();
    expect(result.playerCount).toBe(DEFAULT_TYLOO_ROSTER.length);
    expect(players.map((player) => `${player.number}:${player.name}`).sort()).toEqual(
      DEFAULT_TYLOO_ROSTER.map((player) => `${player.number}:${player.name}`).sort(),
    );
    expect(players.every((player) => player.position === null)).toBe(true);
  });

  it("does not overwrite a custom existing roster", async () => {
    await db.delete();
    await db.open();
    await db.players.put({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      teamId: "00000000-0000-4000-8000-000000000001",
      number: 99,
      name: "Custom",
      position: null,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await bootstrapLocalApp();
    const players = await db.players.toArray();
    expect(players).toHaveLength(1);
    expect(players[0]?.name).toBe("Custom");
  });

  it("migrates the exact legacy development seed without inventing a permanent goalkeeper", async () => {
    await db.delete();
    await db.open();
    await db.players.bulkPut(
      LEGACY_DEV_SQUAD.map((entry, index) => ({
        id: `10000000-0000-4000-8000-00000000000${index}`,
        teamId: "00000000-0000-4000-8000-000000000001",
        number: entry.number,
        name: entry.name,
        position: entry.name === "Benjamin" ? "GK" : "MID",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      })),
    );
    await bootstrapLocalApp();
    const players = await db.players.toArray();
    const active = players.filter((player) => player.active);
    expect(active.map((player) => `${player.number}:${player.name}`).sort()).toEqual(
      DEFAULT_TYLOO_ROSTER.map((player) => `${player.number}:${player.name}`).sort(),
    );
    expect(active.every((player) => player.position === null)).toBe(true);
  });
});
