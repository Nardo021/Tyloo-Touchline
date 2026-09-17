import { describe, expect, it } from "vitest";
import { calculatePeriodStats, deriveMatchReport, deriveScore, getFullTimeScore, getPeriodResult, getScoreForPeriod } from "./statistics.js";
import type { GoalEvent, MatchEvent } from "./events.js";

function goal(overrides: Partial<GoalEvent> = {}): GoalEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    matchId: "22222222-2222-4222-8222-222222222222",
    type: "GOAL",
    playerId: "33333333-3333-4333-8333-333333333333",
    assistPlayerId: null,
    period: 1,
    matchTimeMs: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    deviceId: "44444444-4444-4444-8444-444444444444",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("StatisticsService", () => {
  it("maps a goal to goal, shot, and shot on target", () => {
    const report = deriveMatchReport([goal()]);
    expect(report.scoreFor).toBe(1);
    expect(report.team.goalsFor).toBe(1);
    expect(report.team.shots).toBe(1);
    expect(report.team.shotsOnTarget).toBe(1);
    expect(report.players[0]?.goals).toBe(1);
    expect(report.players[0]?.shots).toBe(1);
    expect(report.players[0]?.shotsOnTarget).toBe(1);
  });

  it("counts an optional assist from goal metadata", () => {
    const assistId = "55555555-5555-4555-8555-555555555555";
    const report = deriveMatchReport([goal({ assistPlayerId: assistId })]);
    const assister = report.players.find((player) => player.playerId === assistId);
    expect(assister?.assists).toBe(1);
  });

  it("ignores voided events", () => {
    const report = deriveMatchReport([goal({ status: "VOIDED" })]);
    expect(report.scoreFor).toBe(0);
    expect(report.team.shots).toBe(0);
    expect(report.players).toEqual([]);
  });

  it("adds time played, goalkeeper time, and goals conceded from context", () => {
    const leo = "33333333-3333-4333-8333-333333333333";
    const benjamin = "55555555-5555-4555-8555-555555555555";
    const events: MatchEvent[] = [
      {
        id: "66666666-6666-4666-8666-666666666666",
        matchId: "22222222-2222-4222-8222-222222222222",
        type: "GOALKEEPER_CHANGE",
        playerId: null,
        previousGoalkeeperId: benjamin,
        newGoalkeeperId: leo,
        period: 2,
        matchTimeMs: 20 * 60 * 1000,
        createdAt: 20,
        updatedAt: 20,
        deviceId: "44444444-4444-4444-8444-444444444444",
        status: "ACTIVE",
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        matchId: "22222222-2222-4222-8222-222222222222",
        type: "GOAL_AGAINST",
        playerId: null,
        period: 1,
        matchTimeMs: 8 * 60 * 1000,
        createdAt: 8,
        updatedAt: 8,
        deviceId: "44444444-4444-4444-8444-444444444444",
        status: "ACTIVE",
      },
    ];
    const report = deriveMatchReport(events, [leo, benjamin], {
      starterIds: [leo, benjamin],
      initialGoalkeeperId: benjamin,
      matchEnd: { period: 2, matchTimeMs: 40 * 60 * 1000 },
      clockMode: "cumulative",
    });
    const leoStats = report.players.find((player) => player.playerId === leo);
    const benjaminStats = report.players.find((player) => player.playerId === benjamin);
    expect(leoStats?.timePlayedMs).toBe(40 * 60 * 1000);
    expect(benjaminStats?.goalkeeperTimeMs).toBe(20 * 60 * 1000);
    expect(leoStats?.goalkeeperTimeMs).toBe(20 * 60 * 1000);
    expect(benjaminStats?.goalsConceded).toBe(1);
    expect(leoStats?.goalsConceded).toBe(0);
  });

  it("derives opponent score from goal against and own goals", () => {
    const events: MatchEvent[] = [
      {
        ...goal(),
        id: "66666666-6666-4666-8666-666666666666",
        type: "GOAL_AGAINST",
        playerId: null,
      },
      {
        ...goal(),
        id: "77777777-7777-4777-8777-777777777777",
        type: "OWN_GOAL",
      },
    ];
    expect(deriveScore(events)).toEqual({ for: 0, against: 2 });
  });

  it("filters first-half statistics away from period 2 events", () => {
    const leo = "33333333-3333-4333-8333-333333333333";
    const events: MatchEvent[] = [
      goal({ period: 1, matchTimeMs: 4 * 60 * 1000 }),
      goal({
        id: "66666666-6666-4666-8666-666666666666",
        period: 2,
        matchTimeMs: 3 * 60 * 1000,
      }),
      {
        ...goal(),
        id: "77777777-7777-4777-8777-777777777777",
        type: "GOAL_AGAINST",
        playerId: null,
        period: 2,
        matchTimeMs: 8 * 60 * 1000,
      },
    ];
    const first = calculatePeriodStats(events, 1, [leo], {
      starterIds: [leo],
      matchEnd: { period: 1, matchTimeMs: 20 * 60 * 1000 },
      clockMode: "period-local",
    });
    const second = calculatePeriodStats(events, 2, [leo], {
      starterIds: [leo],
      matchEnd: { period: 2, matchTimeMs: 20 * 60 * 1000 },
      clockMode: "period-local",
    });
    expect(first.scoreFor).toBe(1);
    expect(first.scoreAgainst).toBe(0);
    expect(second.scoreFor).toBe(1);
    expect(second.scoreAgainst).toBe(1);
    expect(getScoreForPeriod(events, 1)).toEqual({ for: 1, against: 0 });
    expect(getScoreForPeriod(events, 2)).toEqual({ for: 1, against: 1 });
    expect(getFullTimeScore(events)).toEqual({ for: 2, against: 1 });
    expect(getPeriodResult(events, 1)).toEqual({ period: 1, goalsFor: 1, goalsAgainst: 0 });
    expect(getFullTimeScore(events).for).toBe(getScoreForPeriod(events, 1).for + getScoreForPeriod(events, 2).for);
  });
});
