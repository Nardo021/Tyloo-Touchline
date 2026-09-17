import { describe, expect, it } from "vitest";
import { deriveMatchReport, deriveScore } from "./statistics.js";
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
});
