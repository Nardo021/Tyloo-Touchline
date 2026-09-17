import type { AppSettings, Match, MatchEvent, MatchPlayer, Player, Team } from "@tyloo/shared";

export interface EventRow {
  id: string;
  match_id: string;
  player_id: string | null;
  related_player_id: string | null;
  type: string;
  period: number;
  match_time_ms: number;
  metadata_json: string;
  status: "ACTIVE" | "VOIDED";
  device_id: string;
  created_at: number;
  updated_at: number;
}

export interface MatchRow {
  id: string;
  team_id: string;
  opponent: string;
  competition: string;
  date: string;
  status: Match["status"];
  period_count: number;
  period_length_ms: number;
  current_period: number;
  clock_running: number;
  clock_accumulated_ms: number;
  clock_last_started_at: number | null;
  clock_phase: Match["clock"]["phase"];
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
  deleted: number;
}

export function eventToRow(event: MatchEvent): {
  playerId: string | null;
  relatedPlayerId: string | null;
  metadata: Record<string, unknown>;
} {
  switch (event.type) {
    case "GOAL":
      return {
        playerId: event.playerId,
        relatedPlayerId: event.assistPlayerId,
        metadata: { assistPlayerId: event.assistPlayerId },
      };
    case "SUBSTITUTION":
      return {
        playerId: null,
        relatedPlayerId: null,
        metadata: { playerOffId: event.playerOffId, playerOnId: event.playerOnId },
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
      return { playerId: event.playerId, relatedPlayerId: null, metadata: {} };
    case "CORNER_FOR":
    case "CORNER_AGAINST":
    case "GOAL_AGAINST":
    case "MATCH_START":
    case "MATCH_PAUSE":
    case "MATCH_RESUME":
    case "PERIOD_END":
    case "PERIOD_START":
    case "MATCH_END":
      return { playerId: null, relatedPlayerId: null, metadata: {} };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function rowToEvent(row: EventRow): MatchEvent {
  const base = {
    id: row.id,
    matchId: row.match_id,
    period: row.period,
    matchTimeMs: row.match_time_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceId: row.device_id,
    status: row.status,
  };
  const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;

  switch (row.type) {
    case "GOAL":
      return {
        ...base,
        type: "GOAL",
        playerId: row.player_id ?? "",
        assistPlayerId:
          typeof metadata.assistPlayerId === "string"
            ? metadata.assistPlayerId
            : row.related_player_id,
      };
    case "SUBSTITUTION":
      return {
        ...base,
        type: "SUBSTITUTION",
        playerId: null,
        playerOffId: String(metadata.playerOffId ?? ""),
        playerOnId: String(metadata.playerOnId ?? ""),
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
        ...base,
        type: row.type,
        playerId: row.player_id ?? "",
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
        ...base,
        type: row.type,
        playerId: null,
      };
    default:
      throw new Error(`Unsupported event type ${row.type}`);
  }
}

export function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    teamId: row.team_id,
    opponent: row.opponent,
    competition: row.competition,
    date: row.date,
    status: row.status,
    periodCount: row.period_count,
    periodLengthMs: row.period_length_ms,
    currentPeriod: row.current_period,
    clock: {
      running: row.clock_running === 1,
      accumulatedMs: row.clock_accumulated_ms,
      lastStartedAt: row.clock_last_started_at,
      period: row.current_period,
      phase: row.clock_phase,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function rowToPlayer(row: {
  id: string;
  team_id: string;
  number: number;
  name: string;
  position: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}): Player {
  return {
    id: row.id,
    teamId: row.team_id,
    number: row.number,
    name: row.name,
    position: row.position,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToTeam(row: {
  id: string;
  name: string;
  logo_data_url: string | null;
  created_at: number;
  updated_at: number;
}): Team {
  return {
    id: row.id,
    name: row.name,
    logoDataUrl: row.logo_data_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMatchPlayer(row: {
  match_id: string;
  player_id: string;
  starter: number;
  on_field: number;
  created_at: number;
  updated_at: number;
}): MatchPlayer {
  return {
    matchId: row.match_id,
    playerId: row.player_id,
    starter: row.starter === 1,
    onField: row.on_field === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseSettings(value: string): AppSettings {
  return JSON.parse(value) as AppSettings;
}
