import type { ClockPhase, MatchClockState } from "./clock.js";
import type { EventStatus, EventType, MatchEvent } from "./events.js";

export const MATCH_STATUSES = [
  "NOT_STARTED",
  "RUNNING",
  "PAUSED",
  "HALFTIME",
  "FINISHED",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface Team {
  id: string;
  name: string;
  logoDataUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  number: number;
  name: string;
  position: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Match {
  id: string;
  teamId: string;
  opponent: string;
  competition: string;
  date: string;
  status: MatchStatus;
  periodCount: number;
  periodLengthMs: number;
  currentPeriod: number;
  clock: MatchClockState;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface MatchPlayer {
  matchId: string;
  playerId: string;
  starter: boolean;
  onField: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Device {
  id: string;
  name: string;
  lastSeenAt: number;
}

export interface AppSettings {
  teamName: string;
  logoDataUrl: string | null;
  defaultPeriodCount: number;
  defaultPeriodLengthMs: number;
  deviceName: string;
  firstUseHelpSeen: boolean;
  keepAwake: boolean;
  updatedAt: number;
}

export interface ClockStateRecord {
  matchId: string;
  running: boolean;
  accumulatedMs: number;
  lastStartedAt: number | null;
  period: number;
  phase: ClockPhase;
  updatedAt: number;
}

export interface ClockTransition {
  matchId: string;
  kind: "START" | "PAUSE" | "RESUME" | "END_PERIOD" | "START_NEXT_PERIOD" | "END_MATCH" | "RESET";
  clock: MatchClockState;
  at: number;
}

export function matchStatusFromClock(phase: ClockPhase): MatchStatus {
  return phase;
}

export function applySubstitutionToSquad(
  players: MatchPlayer[],
  playerOffId: string,
  playerOnId: string,
  updatedAt: number,
): MatchPlayer[] {
  return players.map((player) => {
    if (player.playerId === playerOffId) {
      return { ...player, onField: false, updatedAt };
    }
    if (player.playerId === playerOnId) {
      return { ...player, onField: true, updatedAt };
    }
    return player;
  });
}

export function revertSubstitutionOnSquad(
  players: MatchPlayer[],
  playerOffId: string,
  playerOnId: string,
  updatedAt: number,
): MatchPlayer[] {
  return players.map((player) => {
    if (player.playerId === playerOffId) {
      return { ...player, onField: true, updatedAt };
    }
    if (player.playerId === playerOnId) {
      return { ...player, onField: false, updatedAt };
    }
    return player;
  });
}

export function eventTouchesPlayer(event: MatchEvent, playerId: string): boolean {
  if ("playerId" in event && event.playerId === playerId) {
    return true;
  }
  if (event.type === "GOAL" && event.assistPlayerId === playerId) {
    return true;
  }
  if (event.type === "SUBSTITUTION") {
    return event.playerOffId === playerId || event.playerOnId === playerId;
  }
  return false;
}

export function summarizeEvent(event: MatchEvent): {
  type: EventType;
  status: EventStatus;
  playerId: string | null;
  relatedPlayerId: string | null;
} {
  switch (event.type) {
    case "GOAL":
      return {
        type: event.type,
        status: event.status,
        playerId: event.playerId,
        relatedPlayerId: event.assistPlayerId,
      };
    case "SUBSTITUTION":
      return {
        type: event.type,
        status: event.status,
        playerId: event.playerOffId,
        relatedPlayerId: event.playerOnId,
      };
    case "ASSIST":
    case "SHOT":
    case "SHOT_ON_TARGET":
    case "KEY_DEFENCE":
    case "INTERCEPTION":
    case "FOUL":
    case "FOUL_WON":
    case "OFFSIDE":
    case "SAVE":
    case "YELLOW_CARD":
    case "RED_CARD":
    case "OWN_GOAL":
      return {
        type: event.type,
        status: event.status,
        playerId: event.playerId,
        relatedPlayerId: null,
      };
    case "CORNER_FOR":
    case "CORNER_AGAINST":
    case "GOAL_AGAINST":
    case "MATCH_START":
    case "MATCH_PAUSE":
    case "MATCH_RESUME":
    case "PERIOD_END":
    case "PERIOD_START":
    case "MATCH_END":
      return {
        type: event.type,
        status: event.status,
        playerId: null,
        relatedPlayerId: null,
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
