import { isActiveEvent, type MatchEvent } from "./events.js";

export interface PlayerStats {
  playerId: string;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  saves: number;
  fouls: number;
  foulsWon: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  keyDefences: number;
  interceptions: number;
  ownGoals: number;
}

export interface TeamStats {
  goalsFor: number;
  goalsAgainst: number;
  shots: number;
  shotsOnTarget: number;
  cornersFor: number;
  cornersAgainst: number;
  fouls: number;
  foulsWon: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  keyDefensiveActions: number;
}

export interface MatchReport {
  scoreFor: number;
  scoreAgainst: number;
  team: TeamStats;
  players: PlayerStats[];
}

function emptyPlayerStats(playerId: string): PlayerStats {
  return {
    playerId,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    saves: 0,
    fouls: 0,
    foulsWon: 0,
    offsides: 0,
    yellowCards: 0,
    redCards: 0,
    keyDefences: 0,
    interceptions: 0,
    ownGoals: 0,
  };
}

function emptyTeamStats(): TeamStats {
  return {
    goalsFor: 0,
    goalsAgainst: 0,
    shots: 0,
    shotsOnTarget: 0,
    cornersFor: 0,
    cornersAgainst: 0,
    fouls: 0,
    foulsWon: 0,
    offsides: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    keyDefensiveActions: 0,
  };
}

function playerBucket(map: Map<string, PlayerStats>, playerId: string): PlayerStats {
  const existing = map.get(playerId);
  if (existing) {
    return existing;
  }
  const created = emptyPlayerStats(playerId);
  map.set(playerId, created);
  return created;
}

export function applyEventToStats(
  event: MatchEvent,
  team: TeamStats,
  players: Map<string, PlayerStats>,
): void {
  if (!isActiveEvent(event)) {
    return;
  }

  switch (event.type) {
    case "GOAL": {
      team.goalsFor += 1;
      team.shots += 1;
      team.shotsOnTarget += 1;
      const scorer = playerBucket(players, event.playerId);
      scorer.goals += 1;
      scorer.shots += 1;
      scorer.shotsOnTarget += 1;
      if (event.assistPlayerId) {
        playerBucket(players, event.assistPlayerId).assists += 1;
      }
      return;
    }
    case "ASSIST":
      playerBucket(players, event.playerId).assists += 1;
      return;
    case "SHOT": {
      team.shots += 1;
      playerBucket(players, event.playerId).shots += 1;
      return;
    }
    case "SHOT_ON_TARGET": {
      team.shots += 1;
      team.shotsOnTarget += 1;
      const player = playerBucket(players, event.playerId);
      player.shots += 1;
      player.shotsOnTarget += 1;
      return;
    }
    case "KEY_DEFENCE": {
      team.keyDefensiveActions += 1;
      playerBucket(players, event.playerId).keyDefences += 1;
      return;
    }
    case "INTERCEPTION": {
      team.keyDefensiveActions += 1;
      playerBucket(players, event.playerId).interceptions += 1;
      return;
    }
    case "FOUL": {
      team.fouls += 1;
      playerBucket(players, event.playerId).fouls += 1;
      return;
    }
    case "FOUL_WON": {
      team.foulsWon += 1;
      playerBucket(players, event.playerId).foulsWon += 1;
      return;
    }
    case "OFFSIDE": {
      team.offsides += 1;
      playerBucket(players, event.playerId).offsides += 1;
      return;
    }
    case "SAVE": {
      team.saves += 1;
      playerBucket(players, event.playerId).saves += 1;
      return;
    }
    case "YELLOW_CARD": {
      team.yellowCards += 1;
      playerBucket(players, event.playerId).yellowCards += 1;
      return;
    }
    case "RED_CARD": {
      team.redCards += 1;
      playerBucket(players, event.playerId).redCards += 1;
      return;
    }
    case "OWN_GOAL": {
      team.goalsAgainst += 1;
      playerBucket(players, event.playerId).ownGoals += 1;
      return;
    }
    case "CORNER_FOR":
      team.cornersFor += 1;
      return;
    case "CORNER_AGAINST":
      team.cornersAgainst += 1;
      return;
    case "GOAL_AGAINST":
      team.goalsAgainst += 1;
      return;
    case "SUBSTITUTION":
    case "MATCH_START":
    case "MATCH_PAUSE":
    case "MATCH_RESUME":
    case "PERIOD_END":
    case "PERIOD_START":
    case "MATCH_END":
      return;
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

export function deriveMatchReport(events: MatchEvent[], playerIds: string[] = []): MatchReport {
  const team = emptyTeamStats();
  const players = new Map<string, PlayerStats>();
  for (const playerId of playerIds) {
    players.set(playerId, emptyPlayerStats(playerId));
  }
  for (const event of events) {
    applyEventToStats(event, team, players);
  }
  return {
    scoreFor: team.goalsFor,
    scoreAgainst: team.goalsAgainst,
    team,
    players: [...players.values()],
  };
}

export function deriveScore(events: MatchEvent[]): { for: number; against: number } {
  const report = deriveMatchReport(events);
  return { for: report.scoreFor, against: report.scoreAgainst };
}
