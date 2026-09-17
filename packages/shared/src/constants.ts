export const APP_NAME = "Touchline";
export const DEFAULT_TEAM_NAME = "Tyloo FC";
export const DEFAULT_PERIOD_COUNT = 2;
export const DEFAULT_PERIOD_LENGTH_MS = 20 * 60 * 1000;
export const DEFAULT_COMPETITION = "NSFA Summer";

export const UNDO_WINDOW_MS = 15_000;
export const CLOCK_DISPLAY_INTERVAL_MS = 250;
export const RECENT_EVENT_LIMIT = 5;

export const BACKUP_FORMAT = "touchline-backup";
export const BACKUP_VERSION = 3;
export const MATCH_EXPORT_FORMAT = "touchline-match";
export const MATCH_EXPORT_VERSION = 3;

export const MATCH_SQUAD_SIZE = 8;
export const MATCH_ON_FIELD_SIZE = 6;
export const MATCH_BENCH_SIZE = 2;

export const DEFAULT_TYLOO_ROSTER = [
  { number: 6, name: "Maxwell" },
  { number: 11, name: "Leo" },
  { number: 9, name: "Allen" },
  { number: 10, name: "Bobby" },
  { number: 8, name: "David" },
  { number: 7, name: "Michael" },
  { number: 5, name: "Adam" },
  { number: 18, name: "Benjamin" },
] as const;

export const LEGACY_DEV_SQUAD = [
  { number: 1, name: "Benjamin" },
  { number: 3, name: "Chris" },
  { number: 4, name: "James" },
  { number: 6, name: "Tom" },
  { number: 7, name: "Maxwell" },
  { number: 8, name: "Sam" },
  { number: 9, name: "Ethan" },
  { number: 10, name: "Alex" },
  { number: 11, name: "Leo" },
  { number: 14, name: "Daniel" },
] as const;

export const PLAYER_EVENT_GRID = [
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
] as const;

export const OUTFIELD_EVENT_GRID = [
  "GOAL",
  "ASSIST",
  "SHOT",
  "SHOT_ON_TARGET",
  "KEY_DEFENCE",
  "FOUL",
] as const;

export const GOALKEEPER_EVENT_GRID = [
  "SAVE",
  "GOAL",
  "SHOT",
  "ASSIST",
  "KEY_DEFENCE",
  "FOUL",
] as const;

export const OUTFIELD_EVENT_MORE = ["SAVE", "SHOT_ON_TARGET", "INTERCEPTION", "FOUL_WON", "OFFSIDE", "OWN_GOAL"] as const;
export const GOALKEEPER_EVENT_MORE = ["SHOT_ON_TARGET", "INTERCEPTION", "FOUL_WON", "OFFSIDE", "OWN_GOAL"] as const;
