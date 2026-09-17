import type { ClockPhase } from "./clock.js";

export const MATCH_PHASES = [
  "PRE_MATCH",
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "FULL_TIME",
] as const;

export type MatchPhase = (typeof MATCH_PHASES)[number];

export function matchPhaseFromClock(phase: ClockPhase, period: number): MatchPhase {
  switch (phase) {
    case "NOT_STARTED":
      return "PRE_MATCH";
    case "RUNNING":
    case "PAUSED":
      return period <= 1 ? "FIRST_HALF" : "SECOND_HALF";
    case "HALFTIME":
      return "HALF_TIME";
    case "FINISHED":
      return "FULL_TIME";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function matchStatusFromPhase(
  phase: MatchPhase,
  clockPhase: ClockPhase,
): "NOT_STARTED" | "RUNNING" | "PAUSED" | "HALFTIME" | "FINISHED" {
  switch (phase) {
    case "PRE_MATCH":
      return "NOT_STARTED";
    case "FIRST_HALF":
    case "SECOND_HALF":
      return clockPhase === "PAUSED" ? "PAUSED" : "RUNNING";
    case "HALF_TIME":
      return "HALFTIME";
    case "FULL_TIME":
      return "FINISHED";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function isLivePhase(phase: MatchPhase): boolean {
  return phase === "FIRST_HALF" || phase === "SECOND_HALF";
}

export function isResumablePhase(phase: MatchPhase): boolean {
  return phase !== "FULL_TIME";
}

export function resumePathForPhase(matchId: string, phase: MatchPhase): string {
  switch (phase) {
    case "PRE_MATCH":
    case "FIRST_HALF":
    case "SECOND_HALF":
      return `/match/${matchId}/live`;
    case "HALF_TIME":
      return `/match/${matchId}/halftime`;
    case "FULL_TIME":
      return `/match/${matchId}/report`;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function resolveMatchPhase(match: {
  phase?: MatchPhase | null;
  clock: { phase: ClockPhase; period: number };
}): MatchPhase {
  return match.phase ?? matchPhaseFromClock(match.clock.phase, match.clock.period);
}

export function matchStatusFromRunning(phase: MatchPhase, running: boolean): "NOT_STARTED" | "RUNNING" | "PAUSED" | "HALFTIME" | "FINISHED" {
  switch (phase) {
    case "PRE_MATCH":
      return "NOT_STARTED";
    case "FIRST_HALF":
    case "SECOND_HALF":
      return running ? "RUNNING" : "PAUSED";
    case "HALF_TIME":
      return "HALFTIME";
    case "FULL_TIME":
      return "FINISHED";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
