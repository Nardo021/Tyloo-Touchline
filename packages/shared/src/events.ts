export const EVENT_STATUSES = ["ACTIVE", "VOIDED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const PLAYER_EVENT_TYPES = [
  "GOAL",
  "ASSIST",
  "SHOT",
  "SHOT_ON_TARGET",
  "KEY_DEFENCE",
  "INTERCEPTION",
  "FOUL",
  "FOUL_WON",
  "OFFSIDE",
  "SAVE",
  "YELLOW_CARD",
  "RED_CARD",
  "OWN_GOAL",
] as const;

export const TEAM_EVENT_TYPES = ["CORNER_FOR", "CORNER_AGAINST", "GOAL_AGAINST"] as const;

export const CONTROL_EVENT_TYPES = [
  "SUBSTITUTION",
  "MATCH_START",
  "MATCH_PAUSE",
  "MATCH_RESUME",
  "PERIOD_END",
  "PERIOD_START",
  "MATCH_END",
] as const;

export const EVENT_TYPES = [
  ...PLAYER_EVENT_TYPES,
  ...TEAM_EVENT_TYPES,
  ...CONTROL_EVENT_TYPES,
] as const;

export type PlayerEventType = (typeof PLAYER_EVENT_TYPES)[number];
export type TeamEventType = (typeof TEAM_EVENT_TYPES)[number];
export type ControlEventType = (typeof CONTROL_EVENT_TYPES)[number];
export type EventType = (typeof EVENT_TYPES)[number];

export interface BaseEvent {
  id: string;
  matchId: string;
  type: EventType;
  period: number;
  matchTimeMs: number;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
  status: EventStatus;
}

export interface GoalEvent extends BaseEvent {
  type: "GOAL";
  playerId: string;
  assistPlayerId: string | null;
}

export interface AssistEvent extends BaseEvent {
  type: "ASSIST";
  playerId: string;
}

export interface ShotEvent extends BaseEvent {
  type: "SHOT";
  playerId: string;
}

export interface ShotOnTargetEvent extends BaseEvent {
  type: "SHOT_ON_TARGET";
  playerId: string;
}

export interface KeyDefenceEvent extends BaseEvent {
  type: "KEY_DEFENCE";
  playerId: string;
}

export interface InterceptionEvent extends BaseEvent {
  type: "INTERCEPTION";
  playerId: string;
}

export interface FoulEvent extends BaseEvent {
  type: "FOUL";
  playerId: string;
}

export interface FoulWonEvent extends BaseEvent {
  type: "FOUL_WON";
  playerId: string;
}

export interface OffsideEvent extends BaseEvent {
  type: "OFFSIDE";
  playerId: string;
}

export interface SaveEvent extends BaseEvent {
  type: "SAVE";
  playerId: string;
}

export interface YellowCardEvent extends BaseEvent {
  type: "YELLOW_CARD";
  playerId: string;
}

export interface RedCardEvent extends BaseEvent {
  type: "RED_CARD";
  playerId: string;
}

export interface OwnGoalEvent extends BaseEvent {
  type: "OWN_GOAL";
  playerId: string;
}

export interface CornerForEvent extends BaseEvent {
  type: "CORNER_FOR";
  playerId: null;
}

export interface CornerAgainstEvent extends BaseEvent {
  type: "CORNER_AGAINST";
  playerId: null;
}

export interface GoalAgainstEvent extends BaseEvent {
  type: "GOAL_AGAINST";
  playerId: null;
}

export interface SubstitutionEvent extends BaseEvent {
  type: "SUBSTITUTION";
  playerId: null;
  playerOffId: string;
  playerOnId: string;
}

export interface MatchControlEvent extends BaseEvent {
  type: "MATCH_START" | "MATCH_PAUSE" | "MATCH_RESUME" | "PERIOD_END" | "PERIOD_START" | "MATCH_END";
  playerId: null;
}

export type MatchEvent =
  | GoalEvent
  | AssistEvent
  | ShotEvent
  | ShotOnTargetEvent
  | KeyDefenceEvent
  | InterceptionEvent
  | FoulEvent
  | FoulWonEvent
  | OffsideEvent
  | SaveEvent
  | YellowCardEvent
  | RedCardEvent
  | OwnGoalEvent
  | CornerForEvent
  | CornerAgainstEvent
  | GoalAgainstEvent
  | SubstitutionEvent
  | MatchControlEvent;

export function isPlayerEvent(
  event: MatchEvent,
): event is Exclude<MatchEvent, CornerForEvent | CornerAgainstEvent | GoalAgainstEvent | SubstitutionEvent | MatchControlEvent> {
  return event.playerId !== null && event.playerId !== undefined;
}

export function eventPlayerId(event: MatchEvent): string | null {
  if ("playerId" in event) {
    return event.playerId;
  }
  return null;
}

export function voidEvent<T extends MatchEvent>(event: T, updatedAt: number): T {
  return {
    ...event,
    status: "VOIDED",
    updatedAt,
  };
}

export function isActiveEvent(event: MatchEvent): boolean {
  return event.status === "ACTIVE";
}
