import { describe, expect, it } from "vitest";
import type { GoalAgainstEvent, GoalkeeperChangeEvent, MatchEvent, SubstitutionEvent } from "./events.js";
import {
  applyGoalkeeperChangeToRuntime,
  applySubstitutionToRuntime,
  calculateGoalkeeperTime,
  calculatePlayerTimePlayed,
  createMatchRuntimeState,
  deriveLineupChanges,
  getGoalkeeperAt,
  getOnFieldPlayersAt,
  goalsConcededByPlayer,
  validateRuntimeState,
} from "./lineup.js";

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

const squad = [
  ids.maxwell,
  ids.leo,
  ids.allen,
  ids.bobby,
  ids.david,
  ids.michael,
  ids.adam,
  ids.benjamin,
];

const firstHalfField = [ids.maxwell, ids.leo, ids.allen, ids.bobby, ids.david, ids.benjamin];
const firstHalfBench = [ids.michael, ids.adam];

function runtime(onField = firstHalfField, goalkeeperId = ids.benjamin, period = 1) {
  return createMatchRuntimeState(matchId, onField, goalkeeperId, period, 1);
}

function sub(overrides: Partial<SubstitutionEvent> = {}): SubstitutionEvent {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    matchId,
    type: "SUBSTITUTION",
    playerId: null,
    playerOffId: ids.leo,
    playerOnId: ids.adam,
    period: 1,
    matchTimeMs: 10 * 60 * 1000,
    createdAt: 10,
    updatedAt: 10,
    deviceId: "30000000-0000-4000-8000-000000000001",
    status: "ACTIVE",
    ...overrides,
  };
}

function gkChange(overrides: Partial<GoalkeeperChangeEvent> = {}): GoalkeeperChangeEvent {
  return {
    id: "20000000-0000-4000-8000-000000000002",
    matchId,
    type: "GOALKEEPER_CHANGE",
    playerId: null,
    previousGoalkeeperId: ids.benjamin,
    newGoalkeeperId: ids.leo,
    period: 1,
    matchTimeMs: 15 * 60 * 1000,
    createdAt: 15,
    updatedAt: 15,
    deviceId: "30000000-0000-4000-8000-000000000001",
    status: "ACTIVE",
    ...overrides,
  };
}

function goalAgainst(overrides: Partial<GoalAgainstEvent> = {}): GoalAgainstEvent {
  return {
    id: "20000000-0000-4000-8000-000000000003",
    matchId,
    type: "GOAL_AGAINST",
    playerId: null,
    period: 1,
    matchTimeMs: 8 * 60 * 1000 + 12_000,
    createdAt: 8,
    updatedAt: 8,
    deviceId: "30000000-0000-4000-8000-000000000001",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("validateRuntimeState", () => {
  it("accepts 8 squad, 6 field, 2 bench, and one on-field goalkeeper", () => {
    const result = validateRuntimeState({
      squadPlayerIds: squad,
      onFieldPlayerIds: firstHalfField,
      goalkeeperId: ids.benjamin,
    });
    expect(result).toEqual({ ok: true, benchPlayerIds: firstHalfBench });
  });

  it("rejects the wrong squad size", () => {
    const result = validateRuntimeState({
      squadPlayerIds: squad.slice(0, 7),
      onFieldPlayerIds: firstHalfField,
      goalkeeperId: ids.benjamin,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects five or seven on-field players", () => {
    expect(
      validateRuntimeState({
        squadPlayerIds: squad,
        onFieldPlayerIds: firstHalfField.slice(0, 5),
        goalkeeperId: ids.benjamin,
      }).ok,
    ).toBe(false);
    expect(
      validateRuntimeState({
        squadPlayerIds: squad,
        onFieldPlayerIds: [...firstHalfField, ids.michael],
        goalkeeperId: ids.benjamin,
      }).ok,
    ).toBe(false);
  });

  it("rejects a goalkeeper who is not on the field", () => {
    const result = validateRuntimeState({
      squadPlayerIds: squad,
      onFieldPlayerIds: firstHalfField,
      goalkeeperId: ids.michael,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing goalkeeper", () => {
    expect(
      validateRuntimeState({
        squadPlayerIds: squad,
        onFieldPlayerIds: firstHalfField,
        goalkeeperId: null,
      }).ok,
    ).toBe(false);
  });

  it("rejects duplicate player IDs", () => {
    const result = validateRuntimeState({
      squadPlayerIds: [...squad, ids.leo],
      onFieldPlayerIds: firstHalfField,
      goalkeeperId: ids.benjamin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("duplicate"))).toBe(true);
    }
  });
});

describe("normal substitution", () => {
  it("keeps 6 on field, 2 on bench, and the same goalkeeper", () => {
    const next = applySubstitutionToRuntime(runtime(), ids.leo, ids.adam, 2);
    expect(next.onFieldPlayerIds).toHaveLength(6);
    expect(next.onFieldPlayerIds).toContain(ids.adam);
    expect(next.onFieldPlayerIds).not.toContain(ids.leo);
    expect(next.goalkeeperId).toBe(ids.benjamin);
    expect(validateRuntimeState({
      squadPlayerIds: squad,
      onFieldPlayerIds: next.onFieldPlayerIds,
      goalkeeperId: next.goalkeeperId,
    }).ok).toBe(true);
  });
});

describe("substitute current goalkeeper off", () => {
  it("requires a new on-field goalkeeper and keeps a valid runtime", () => {
    expect(() => applySubstitutionToRuntime(runtime(), ids.benjamin, ids.michael, 2)).toThrow(/new goalkeeper/i);

    const next = applySubstitutionToRuntime(runtime(), ids.benjamin, ids.michael, 2, ids.leo);
    expect(next.onFieldPlayerIds).toContain(ids.michael);
    expect(next.onFieldPlayerIds).not.toContain(ids.benjamin);
    expect(next.goalkeeperId).toBe(ids.leo);
    expect(next.onFieldPlayerIds).toHaveLength(6);
    expect(validateRuntimeState({
      squadPlayerIds: squad,
      onFieldPlayerIds: next.onFieldPlayerIds,
      goalkeeperId: next.goalkeeperId,
    })).toEqual({ ok: true, benchPlayerIds: [ids.adam, ids.benjamin] });
  });

  it("allows the incoming substitute to become goalkeeper immediately", () => {
    const next = applySubstitutionToRuntime(runtime(), ids.benjamin, ids.michael, 2, ids.michael);
    expect(next.goalkeeperId).toBe(ids.michael);
    expect(next.onFieldPlayerIds).toContain(ids.michael);
    expect(next.onFieldPlayerIds).not.toContain(ids.benjamin);
  });
});

describe("simple goalkeeper change", () => {
  it("changes only the goalkeeper role", () => {
    const next = applyGoalkeeperChangeToRuntime(runtime(), ids.leo, 2);
    expect(next.onFieldPlayerIds).toEqual(firstHalfField);
    expect(next.goalkeeperId).toBe(ids.leo);
  });
});

describe("half-time lineup derivation", () => {
  it("derives two substitutions and can keep a goalkeeper change separate", () => {
    const secondHalf = [ids.maxwell, ids.leo, ids.allen, ids.michael, ids.david, ids.adam];
    const changes = deriveLineupChanges(firstHalfField, secondHalf);
    expect(changes.leaving).toEqual([ids.bobby, ids.benjamin]);
    expect(changes.entering).toEqual([ids.michael, ids.adam]);
    expect(changes.pairs).toEqual([
      { playerOffId: ids.bobby, playerOnId: ids.michael },
      { playerOffId: ids.benjamin, playerOnId: ids.adam },
    ]);

    const events: MatchEvent[] = [
      sub({
        id: "20000000-0000-4000-8000-000000000010",
        playerOffId: ids.bobby,
        playerOnId: ids.michael,
        period: 2,
        matchTimeMs: 20 * 60 * 1000,
        createdAt: 20,
      }),
      sub({
        id: "20000000-0000-4000-8000-000000000011",
        playerOffId: ids.benjamin,
        playerOnId: ids.adam,
        period: 2,
        matchTimeMs: 20 * 60 * 1000,
        createdAt: 20,
      }),
      gkChange({
        id: "20000000-0000-4000-8000-000000000012",
        previousGoalkeeperId: ids.benjamin,
        newGoalkeeperId: ids.leo,
        period: 2,
        matchTimeMs: 20 * 60 * 1000,
        createdAt: 20,
      }),
    ];

    const endOfFirst = getOnFieldPlayersAt({
      starterIds: firstHalfField,
      events,
      query: { period: 1, matchTimeMs: 20 * 60 * 1000 },
    });
    expect(endOfFirst.sort()).toEqual([...firstHalfField].sort());
    expect(getGoalkeeperAt({
      initialGoalkeeperId: ids.benjamin,
      events,
      query: { period: 1, matchTimeMs: 20 * 60 * 1000 },
    })).toBe(ids.benjamin);

    const startOfSecond = getOnFieldPlayersAt({
      starterIds: firstHalfField,
      events,
      query: { period: 2, matchTimeMs: 20 * 60 * 1000, createdAt: 20 },
    });
    expect(startOfSecond.sort()).toEqual([...secondHalf].sort());
    expect(getGoalkeeperAt({
      initialGoalkeeperId: ids.benjamin,
      events,
      query: { period: 2, matchTimeMs: 20 * 60 * 1000, createdAt: 20 },
    })).toBe(ids.leo);
  });
});

describe("time played", () => {
  it("sums multiple on-field intervals using cumulative match time", () => {
    const events: MatchEvent[] = [
      sub({ matchTimeMs: 10 * 60 * 1000, createdAt: 10 }),
      sub({
        id: "20000000-0000-4000-8000-000000000021",
        playerOffId: ids.adam,
        playerOnId: ids.leo,
        matchTimeMs: 18 * 60 * 1000,
        createdAt: 18,
      }),
    ];
    const played = calculatePlayerTimePlayed({
      playerId: ids.leo,
      starterIds: firstHalfField,
      events,
      matchEnd: { period: 2, matchTimeMs: 40 * 60 * 1000 },
    });
    expect(played).toBe(32 * 60 * 1000);
  });
});

describe("goalkeeper duration", () => {
  it("splits a single change at half-time", () => {
    const events: MatchEvent[] = [
      gkChange({ period: 2, matchTimeMs: 20 * 60 * 1000, createdAt: 20 }),
    ];
    const matchEnd = { period: 2, matchTimeMs: 40 * 60 * 1000 };
    expect(calculateGoalkeeperTime({
      playerId: ids.benjamin,
      initialGoalkeeperId: ids.benjamin,
      events,
      matchEnd,
    })).toBe(20 * 60 * 1000);
    expect(calculateGoalkeeperTime({
      playerId: ids.leo,
      initialGoalkeeperId: ids.benjamin,
      events,
      matchEnd,
    })).toBe(20 * 60 * 1000);
  });

  it("sums multiple goalkeeper intervals", () => {
    const events: MatchEvent[] = [
      gkChange({ matchTimeMs: 12 * 60 * 1000 + 30_000, createdAt: 12 }),
      gkChange({
        id: "20000000-0000-4000-8000-000000000031",
        previousGoalkeeperId: ids.leo,
        newGoalkeeperId: ids.benjamin,
        matchTimeMs: 25 * 60 * 1000,
        period: 2,
        createdAt: 25,
      }),
    ];
    const matchEnd = { period: 2, matchTimeMs: 40 * 60 * 1000 };
    expect(calculateGoalkeeperTime({
      playerId: ids.benjamin,
      initialGoalkeeperId: ids.benjamin,
      events,
      matchEnd,
    })).toBe(12 * 60 * 1000 + 30_000 + 15 * 60 * 1000);
    expect(calculateGoalkeeperTime({
      playerId: ids.leo,
      initialGoalkeeperId: ids.benjamin,
      events,
      matchEnd,
    })).toBe(25 * 60 * 1000 - (12 * 60 * 1000 + 30_000));
  });
});

describe("period-local goalkeeper history", () => {
  it("attributes saves and conceded goals after a second-half change", () => {
    const events: MatchEvent[] = [
      gkChange({
        previousGoalkeeperId: ids.maxwell,
        newGoalkeeperId: ids.michael,
        period: 2,
        matchTimeMs: 0,
        createdAt: 20,
      }),
      gkChange({
        id: "20000000-0000-4000-8000-000000000032",
        previousGoalkeeperId: ids.michael,
        newGoalkeeperId: ids.leo,
        period: 2,
        matchTimeMs: 12 * 60 * 1000,
        createdAt: 32,
      }),
      goalAgainst({
        id: "20000000-0000-4000-8000-000000000044",
        period: 1,
        matchTimeMs: 8 * 60 * 1000,
        createdAt: 8,
      }),
      goalAgainst({
        id: "20000000-0000-4000-8000-000000000045",
        period: 2,
        matchTimeMs: 6 * 60 * 1000,
        createdAt: 26,
      }),
      goalAgainst({
        id: "20000000-0000-4000-8000-000000000046",
        period: 2,
        matchTimeMs: 15 * 60 * 1000,
        createdAt: 35,
      }),
    ];
    const matchEnd = { period: 2, matchTimeMs: 20 * 60 * 1000 + 31_000 };
    expect(calculateGoalkeeperTime({
      playerId: ids.maxwell,
      initialGoalkeeperId: ids.maxwell,
      events,
      matchEnd,
      clockMode: "period-local",
      periodDurationsMs: [20 * 60 * 1000, 20 * 60 * 1000 + 31_000],
    })).toBe(20 * 60 * 1000);
    expect(calculateGoalkeeperTime({
      playerId: ids.michael,
      initialGoalkeeperId: ids.maxwell,
      events,
      matchEnd,
      clockMode: "period-local",
      periodDurationsMs: [20 * 60 * 1000, 20 * 60 * 1000 + 31_000],
    })).toBe(12 * 60 * 1000);
    expect(calculateGoalkeeperTime({
      playerId: ids.leo,
      initialGoalkeeperId: ids.maxwell,
      events,
      matchEnd,
      clockMode: "period-local",
      periodDurationsMs: [20 * 60 * 1000, 20 * 60 * 1000 + 31_000],
    })).toBe(8 * 60 * 1000 + 31_000);
    expect(goalsConcededByPlayer({ playerId: ids.maxwell, initialGoalkeeperId: ids.maxwell, events, period: 1 })).toBe(1);
    expect(goalsConcededByPlayer({ playerId: ids.michael, initialGoalkeeperId: ids.maxwell, events, period: 2 })).toBe(1);
    expect(goalsConcededByPlayer({ playerId: ids.leo, initialGoalkeeperId: ids.maxwell, events, period: 2 })).toBe(1);
  });
});

describe("goals conceded", () => {
  it("attributes opponent goals to the goalkeeper at that match instant", () => {
    const events: MatchEvent[] = [
      goalAgainst({ id: "20000000-0000-4000-8000-000000000041", matchTimeMs: 8 * 60 * 1000 + 12_000, createdAt: 8 }),
      gkChange({ matchTimeMs: 20 * 60 * 1000, period: 2, createdAt: 20 }),
      goalAgainst({
        id: "20000000-0000-4000-8000-000000000042",
        period: 2,
        matchTimeMs: 25 * 60 * 1000 + 3_000,
        createdAt: 25,
      }),
      goalAgainst({
        id: "20000000-0000-4000-8000-000000000043",
        period: 2,
        matchTimeMs: 25 * 60 * 1000 + 3_000,
        createdAt: 26,
      }),
    ];
    expect(goalsConcededByPlayer({
      playerId: ids.benjamin,
      initialGoalkeeperId: ids.benjamin,
      events,
    })).toBe(1);
    expect(goalsConcededByPlayer({
      playerId: ids.leo,
      initialGoalkeeperId: ids.benjamin,
      events,
    })).toBe(2);
  });
});
