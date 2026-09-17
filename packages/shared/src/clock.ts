export const CLOCK_PHASES = [
  "NOT_STARTED",
  "RUNNING",
  "PAUSED",
  "HALFTIME",
  "FINISHED",
] as const;

export type ClockPhase = (typeof CLOCK_PHASES)[number];

export const CLOCK_MODES = ["period-local", "cumulative"] as const;
export type ClockMode = (typeof CLOCK_MODES)[number];

export type ClockTimerKind = "PAUSE" | "RESUME" | "RESET";

export interface MatchClockState {
  running: boolean;
  accumulatedMs: number;
  lastStartedAt: number | null;
  period: number;
  phase: ClockPhase;
}

export function createInitialClock(period = 1): MatchClockState {
  return {
    running: false,
    accumulatedMs: 0,
    lastStartedAt: null,
    period,
    phase: "NOT_STARTED",
  };
}

export function displayedElapsedMs(clock: MatchClockState, now: number): number {
  if (clock.running && clock.lastStartedAt !== null) {
    return Math.max(0, clock.accumulatedMs + (now - clock.lastStartedAt));
  }
  return Math.max(0, clock.accumulatedMs);
}

export function pauseClock(clock: MatchClockState, now: number): MatchClockState {
  if (!clock.running || clock.phase === "FINISHED") {
    return clock;
  }
  return {
    ...clock,
    running: false,
    accumulatedMs: displayedElapsedMs(clock, now),
    lastStartedAt: null,
    phase: "PAUSED",
  };
}

export function resumeClock(clock: MatchClockState, now: number): MatchClockState {
  if (clock.running || clock.phase === "FINISHED" || clock.phase === "NOT_STARTED") {
    return clock;
  }
  if (clock.phase === "HALFTIME") {
    return clock;
  }
  return {
    ...clock,
    running: true,
    lastStartedAt: now,
    phase: "RUNNING",
  };
}

export function startMatch(clock: MatchClockState, now: number): MatchClockState {
  if (clock.phase !== "NOT_STARTED") {
    return clock;
  }
  return {
    running: true,
    accumulatedMs: 0,
    lastStartedAt: now,
    period: 1,
    phase: "RUNNING",
  };
}

export function endPeriod(
  clock: MatchClockState,
  now: number,
  periodCount: number,
): MatchClockState {
  if (clock.phase === "FINISHED" || clock.phase === "NOT_STARTED") {
    return clock;
  }
  const accumulatedMs = displayedElapsedMs(clock, now);
  if (clock.period >= periodCount) {
    return {
      running: false,
      accumulatedMs,
      lastStartedAt: null,
      period: clock.period,
      phase: "PAUSED",
    };
  }
  return {
    running: false,
    accumulatedMs,
    lastStartedAt: null,
    period: clock.period,
    phase: "HALFTIME",
  };
}

export function startNextPeriod(clock: MatchClockState, now: number, periodCount: number): MatchClockState {
  if (clock.phase !== "HALFTIME" && clock.phase !== "PAUSED") {
    return clock;
  }
  if (clock.period >= periodCount) {
    return clock;
  }
  return {
    running: true,
    accumulatedMs: 0,
    lastStartedAt: now,
    period: clock.period + 1,
    phase: "RUNNING",
  };
}

export function endMatch(clock: MatchClockState, now: number): MatchClockState {
  if (clock.phase === "FINISHED") {
    return clock;
  }
  return {
    running: false,
    accumulatedMs: displayedElapsedMs(clock, now),
    lastStartedAt: null,
    period: clock.period,
    phase: "FINISHED",
  };
}

export function resetClock(clock: MatchClockState, now: number): MatchClockState {
  if (clock.phase === "FINISHED") {
    return clock;
  }
  return {
    running: clock.running,
    accumulatedMs: 0,
    lastStartedAt: clock.running ? now : null,
    period: clock.period,
    phase: clock.phase === "NOT_STARTED" ? "NOT_STARTED" : clock.running ? "RUNNING" : clock.phase,
  };
}

export function reconstructClock(clock: MatchClockState, _now: number): MatchClockState {
  return { ...clock };
}

export function canStart(clock: MatchClockState): boolean {
  return clock.phase === "NOT_STARTED";
}

export function canPause(clock: MatchClockState): boolean {
  return clock.phase === "RUNNING";
}

export function canResume(clock: MatchClockState): boolean {
  return clock.phase === "PAUSED";
}

export function canEndPeriod(clock: MatchClockState): boolean {
  return clock.phase === "RUNNING" || clock.phase === "PAUSED";
}

export function canStartNextPeriod(clock: MatchClockState, periodCount: number): boolean {
  return clock.phase === "HALFTIME" && clock.period < periodCount;
}

export function canEndMatch(clock: MatchClockState): boolean {
  return clock.phase !== "NOT_STARTED" && clock.phase !== "FINISHED";
}

export type ClockTransitionKind =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "END_PERIOD"
  | "START_NEXT_PERIOD"
  | "END_MATCH"
  | "RESET";

export function applyClockTransition(
  clock: MatchClockState,
  kind: ClockTransitionKind,
  now: number,
  periodCount: number,
): MatchClockState {
  switch (kind) {
    case "START":
      return startMatch(clock, now);
    case "PAUSE":
      return pauseClock(clock, now);
    case "RESUME":
      return resumeClock(clock, now);
    case "END_PERIOD":
      return endPeriod(clock, now, periodCount);
    case "START_NEXT_PERIOD":
      return startNextPeriod(clock, now, periodCount);
    case "END_MATCH":
      return endMatch(clock, now);
    case "RESET":
      return resetClock(clock, now);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
