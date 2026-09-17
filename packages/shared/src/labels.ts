import type { ClockPhase } from "./clock.js";
import type { EventType } from "./events.js";

export const EVENT_LABELS: Record<EventType, string> = {
  GOAL: "Goal",
  ASSIST: "Assist",
  SHOT: "Shot",
  SHOT_ON_TARGET: "Shot on target",
  KEY_DEFENCE: "Key defence",
  INTERCEPTION: "Interception",
  FOUL: "Foul",
  FOUL_WON: "Foul won",
  OFFSIDE: "Offside",
  SAVE: "Save",
  YELLOW_CARD: "Yellow card",
  RED_CARD: "Red card",
  OWN_GOAL: "Own goal",
  CORNER_FOR: "Corner",
  CORNER_AGAINST: "Opponent corner",
  GOAL_AGAINST: "Opponent goal",
  SUBSTITUTION: "Substitution",
  MATCH_START: "Match started",
  MATCH_PAUSE: "Paused",
  MATCH_RESUME: "Resumed",
  PERIOD_END: "Period ended",
  PERIOD_START: "Period started",
  MATCH_END: "Match ended",
};

export const EVENT_BUTTON_LABELS: Record<EventType, string> = {
  GOAL: "GOAL",
  ASSIST: "ASSIST",
  SHOT: "SHOT",
  SHOT_ON_TARGET: "SHOT ON TARGET",
  KEY_DEFENCE: "KEY DEFENCE",
  INTERCEPTION: "INTERCEPTION",
  FOUL: "FOUL",
  FOUL_WON: "FOUL WON",
  OFFSIDE: "OFFSIDE",
  SAVE: "SAVE",
  YELLOW_CARD: "YELLOW CARD",
  RED_CARD: "RED CARD",
  OWN_GOAL: "OWN GOAL",
  CORNER_FOR: "CORNER",
  CORNER_AGAINST: "OPP CORNER",
  GOAL_AGAINST: "OPP GOAL",
  SUBSTITUTION: "SUBSTITUTION",
  MATCH_START: "START MATCH",
  MATCH_PAUSE: "PAUSE",
  MATCH_RESUME: "RESUME",
  PERIOD_END: "END PERIOD",
  PERIOD_START: "START NEXT PERIOD",
  MATCH_END: "END MATCH",
};

export function periodLabel(period: number, periodCount: number): string {
  if (periodCount === 2) {
    return period === 1 ? "First half" : "Second half";
  }
  return `Period ${period}`;
}

export function clockPhaseLabel(phase: ClockPhase, period: number, periodCount: number): string {
  switch (phase) {
    case "NOT_STARTED":
      return "Not started";
    case "RUNNING":
      return periodLabel(period, periodCount);
    case "PAUSED":
      return `${periodLabel(period, periodCount)} · Paused`;
    case "HALFTIME":
      return periodCount === 2 && period === 1 ? "Half-time" : `End of period ${period}`;
    case "FINISHED":
      return "Full time";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function formatMatchTime(matchTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(matchTimeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}
