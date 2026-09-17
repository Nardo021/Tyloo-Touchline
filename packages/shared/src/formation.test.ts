import { describe, expect, it } from "vitest";
import {
  applyDefaultFirstHalfPreset,
  applyDefaultSecondHalfPreset,
  applyGoalkeeperToSlots,
  assignSlotPlayer,
  inheritSlotOnSubstitution,
  remapSlotsToFormation,
  resolveHalftimeInitialLineup,
  reviewLineupChange,
  normalizeFormationType,
  validateLineup,
} from "./formation.js";
import { calculateGoalkeeperStints, calculateRoleDurations } from "./formationDurations.js";

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

const players = [
  { id: ids.maxwell, number: 6 },
  { id: ids.leo, number: 11 },
  { id: ids.allen, number: 9 },
  { id: ids.bobby, number: 10 },
  { id: ids.david, number: 8 },
  { id: ids.michael, number: 7 },
  { id: ids.adam, number: 5 },
  { id: ids.benjamin, number: 18 },
];

describe("default Tyloo presets", () => {
  it("builds the first-half 2-1-2 preset from shirt numbers", () => {
    const preset = applyDefaultFirstHalfPreset(players);
    expect(preset.formation).toBe("2-1-2");
    expect(preset.goalkeeperId).toBe(ids.maxwell);
    expect(preset.onFieldPlayerIds.sort()).toEqual(
      [ids.leo, ids.michael, ids.bobby, ids.adam, ids.benjamin, ids.maxwell].sort(),
    );
    expect(validateLineup(preset.formation, preset.slots, preset.onFieldPlayerIds).ok).toBe(true);
  });

  it("does not invent a second-half forward", () => {
    const preset = applyDefaultSecondHalfPreset(players);
    expect(preset.formation).toBe("2-2-1");
    expect(preset.goalkeeperId).toBe(ids.michael);
    expect(preset.slots.find((slot) => slot.slotId === "FWD_CENTER")?.playerId).toBe("");
    expect(preset.slots.find((slot) => slot.slotId === "MID_LEFT")?.playerId).toBe(ids.maxwell);
    expect(validateLineup(preset.formation, preset.slots, preset.onFieldPlayerIds).ok).toBe(false);
  });
});

describe("slot assignment", () => {
  it("rejects a player occupying two slots", () => {
    const preset = applyDefaultFirstHalfPreset(players);
    const duplicated = preset.slots.map((slot) => (
      slot.slotId === "MID_CENTER" ? { ...slot, playerId: ids.leo } : slot
    ));
    const result = validateLineup(preset.formation, duplicated, preset.onFieldPlayerIds);
    expect(result.ok).toBe(false);
  });

  it("swaps when assigning a player who already has a slot", () => {
    const preset = applyDefaultFirstHalfPreset(players);
    const next = assignSlotPlayer(preset.slots, "MID_CENTER", ids.leo);
    expect(next.find((slot) => slot.slotId === "MID_CENTER")?.playerId).toBe(ids.leo);
    expect(next.find((slot) => slot.slotId === "FWD_LEFT")?.playerId).toBe(ids.bobby);
  });

  it("lets an incoming substitute inherit the vacated slot", () => {
    const preset = applyDefaultFirstHalfPreset(players);
    const next = inheritSlotOnSubstitution(preset.slots, ids.leo, ids.david);
    expect(next.find((slot) => slot.slotId === "FWD_LEFT")?.playerId).toBe(ids.david);
    expect(next.some((slot) => slot.playerId === ids.leo)).toBe(false);
  });

  it("moves the previous goalkeeper into the vacated outfield slot", () => {
    const preset = applyDefaultFirstHalfPreset(players);
    const next = applyGoalkeeperToSlots(preset.slots, ids.michael);
    expect(next.find((slot) => slot.role === "GK")?.playerId).toBe(ids.michael);
    expect(next.find((slot) => slot.slotId === "FWD_RIGHT")?.playerId).toBe(ids.maxwell);
  });
});

describe("half-time initial lineup", () => {
  it("ignores an empty HALF_TIME draft and keeps the first-half six", () => {
    const first = applyDefaultFirstHalfPreset(players);
    const second = applyDefaultSecondHalfPreset(players);
    const initial = resolveHalftimeInitialLineup({
      draft: {
        matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        purpose: "HALF_TIME",
        formation: "2-2-1",
        slots: [],
        onFieldPlayerIds: [],
        goalkeeperId: "",
        updatedAt: 1,
      },
      previousOnField: first.onFieldPlayerIds,
      previousSlots: first.slots,
      previousGk: first.goalkeeperId,
      presetFormation: second.formation,
      presetSlots: second.slots,
    });
    expect(initial.source).toBe("first-half");
    expect(initial.onFieldIds.sort()).toEqual(first.onFieldPlayerIds.sort());
    expect(initial.formation).toBe("2-2-1");
    expect(initial.slots.find((slot) => slot.role === "GK")?.playerId).toBe(ids.michael);
    expect(validateLineup(initial.formation, initial.slots, initial.onFieldIds).ok).toBe(true);
  });

  it("restores a complete HALF_TIME draft", () => {
    const first = applyDefaultFirstHalfPreset(players);
    const nextSix = first.onFieldPlayerIds.map((id) => (id === ids.benjamin ? ids.david : id));
    const slots = remapSlotsToFormation(first.slots, "2-2-1", nextSix, ids.michael);
    const initial = resolveHalftimeInitialLineup({
      draft: {
        matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        purpose: "HALF_TIME",
        formation: "2-2-1",
        slots,
        onFieldPlayerIds: nextSix,
        goalkeeperId: ids.michael,
        updatedAt: 1,
      },
      previousOnField: first.onFieldPlayerIds,
      previousSlots: first.slots,
      previousGk: first.goalkeeperId,
      presetFormation: "2-2-1",
      presetSlots: applyDefaultSecondHalfPreset(players).slots,
    });
    expect(initial.source).toBe("draft");
    expect(initial.onFieldIds.sort()).toEqual(nextSix.sort());
    expect(initial.slots.find((slot) => slot.playerId === ids.david)).toBeTruthy();
  });
});

describe("formation remap and review", () => {
  it("keeps the same six when remapping 2-1-2 to 2-2-1", () => {
    const first = applyDefaultFirstHalfPreset(players);
    const remapped = remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael);
    const result = validateLineup("2-2-1", remapped, first.onFieldPlayerIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.goalkeeperId).toBe(ids.michael);
    }
    const review = reviewLineupChange(
      { formation: "2-1-2", slots: first.slots },
      { formation: "2-2-1", slots: remapped },
    );
    expect(review.formationChanged).toBe(true);
    expect(review.goalkeeperChanged).toBe(true);
    expect(review.previousGoalkeeperId).toBe(ids.maxwell);
    expect(review.newGoalkeeperId).toBe(ids.michael);
  });
});

describe("role duration from snapshots", () => {
  it("attributes intervals across both halves", () => {
    const first = applyDefaultFirstHalfPreset(players);
    const second = remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael);
    const durations = calculateRoleDurations({
      snapshots: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 1,
          formation: "2-1-2",
          effectiveMatchTimeMs: 0,
          slots: first.slots,
          createdAt: 1,
          status: "ACTIVE",
        },
        {
          id: "20000000-0000-4000-8000-000000000002",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 1,
          formation: "2-2-1",
          effectiveMatchTimeMs: 11 * 60 * 1000 + 30_000,
          slots: remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael),
          createdAt: 2,
          status: "ACTIVE",
        },
        {
          id: "20000000-0000-4000-8000-000000000003",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 1,
          formation: "2-1-2",
          effectiveMatchTimeMs: 16 * 60 * 1000,
          slots: first.slots,
          createdAt: 3,
          status: "ACTIVE",
        },
        {
          id: "20000000-0000-4000-8000-000000000004",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 2,
          formation: "2-2-1",
          effectiveMatchTimeMs: 0,
          slots: second,
          createdAt: 4,
          status: "ACTIVE",
        },
      ],
      playerId: ids.maxwell,
      periodDurationsMs: [20 * 60 * 1000, 20 * 60 * 1000],
    });
    const firstHalfGk = durations.find((item) => item.period === 1 && item.role === "GK");
    const firstHalfMid = durations.find((item) => item.period === 1 && item.role === "MID");
    const secondHalfMid = durations.find((item) => item.period === 2 && item.role === "MID");
    expect(firstHalfGk?.durationMs).toBe(11 * 60 * 1000 + 30_000 + 4 * 60 * 1000);
    expect(firstHalfMid?.durationMs).toBe(4 * 60 * 1000 + 30_000);
    expect(secondHalfMid?.durationMs).toBe(20 * 60 * 1000);
  });

  it("splits goalkeeper stints when the keeper changes mid-half", () => {
    const first = applyDefaultFirstHalfPreset(players);
    const second = remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael);
    const late = applyGoalkeeperToSlots(second, ids.leo);
    const stints = calculateGoalkeeperStints({
      snapshots: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 1,
          formation: "2-1-2",
          effectiveMatchTimeMs: 0,
          slots: first.slots,
          createdAt: 1,
          status: "ACTIVE",
        },
        {
          id: "30000000-0000-4000-8000-000000000002",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 2,
          formation: "2-2-1",
          effectiveMatchTimeMs: 0,
          slots: second,
          createdAt: 2,
          status: "ACTIVE",
        },
        {
          id: "30000000-0000-4000-8000-000000000003",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 2,
          formation: "2-2-1",
          effectiveMatchTimeMs: 12 * 60 * 1000,
          slots: late,
          createdAt: 3,
          status: "ACTIVE",
        },
      ],
      periodDurationsMs: [20 * 60 * 1000, 20 * 60 * 1000],
    });
    expect(stints).toEqual([
      { playerId: ids.maxwell, period: 1, fromMs: 0, toMs: 20 * 60 * 1000 },
      { playerId: ids.michael, period: 2, fromMs: 0, toMs: 12 * 60 * 1000 },
      { playerId: ids.leo, period: 2, fromMs: 12 * 60 * 1000, toMs: 20 * 60 * 1000 },
    ]);
  });

  it("ignores voided snapshots", () => {
    const first = applyDefaultFirstHalfPreset(players);
    const durations = calculateRoleDurations({
      snapshots: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 1,
          formation: "2-1-2",
          effectiveMatchTimeMs: 0,
          slots: first.slots,
          createdAt: 1,
          status: "ACTIVE",
        },
        {
          id: "40000000-0000-4000-8000-000000000002",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          period: 1,
          formation: "2-2-1",
          effectiveMatchTimeMs: 5 * 60 * 1000,
          slots: remapSlotsToFormation(first.slots, "2-2-1", first.onFieldPlayerIds, ids.michael),
          createdAt: 2,
          status: "VOIDED",
        },
      ],
      playerId: ids.maxwell,
      periodDurationsMs: [20 * 60 * 1000],
    });
    expect(durations.find((item) => item.role === "GK")?.durationMs).toBe(20 * 60 * 1000);
  });
});

describe("normalizeFormationType", () => {
  it("maps CUSTOM and unknown values to 2-1-2", () => {
    expect(normalizeFormationType("CUSTOM")).toBe("2-1-2");
    expect(normalizeFormationType("2-1-2")).toBe("2-1-2");
    expect(normalizeFormationType("2-2-1")).toBe("2-2-1");
    expect(normalizeFormationType(undefined)).toBe("2-1-2");
  });
});
