export const APP_NAME = "Touchline";
export const DEFAULT_TEAM_NAME = "Tyloo FC";
export const DEFAULT_PERIOD_COUNT = 2;
export const DEFAULT_PERIOD_LENGTH_MS = 20 * 60 * 1000;
export const DEFAULT_COMPETITION = "NSFA Summer";

export const UNDO_WINDOW_MS = 15_000;
export const CLOCK_DISPLAY_INTERVAL_MS = 250;
export const RECENT_EVENT_LIMIT = 5;

export const BACKUP_FORMAT = "touchline-backup";
export const BACKUP_VERSION = 1;
export const MATCH_EXPORT_FORMAT = "touchline-match";
export const MATCH_EXPORT_VERSION = 1;

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

export const PLAYER_EVENT_MORE = ["OWN_GOAL"] as const;
