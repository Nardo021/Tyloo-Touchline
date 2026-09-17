import {
  createId,
  createInitialClock,
  DEFAULT_TEAM_ID,
  type Match,
  type MatchPlayer,
  type Player,
} from "@tyloo/shared";
import { db, getAppSettings } from "../../db/database";
import { toLocalWriteError } from "../../lib/localWrite";

export interface CreateMatchInput {
  opponent: string;
  competition: string;
  date: string;
  periodCount: number;
  periodLengthMs: number;
  squadIds: string[];
  starterIds: string[];
}

export class MatchPersistence {
  async create(input: CreateMatchInput): Promise<Match> {
    const settings = await getAppSettings();
    const now = Date.now();
    const match: Match = {
      id: createId(),
      teamId: DEFAULT_TEAM_ID,
      opponent: input.opponent.trim(),
      competition: input.competition.trim() || settings.teamName,
      date: input.date,
      status: "NOT_STARTED",
      periodCount: input.periodCount,
      periodLengthMs: input.periodLengthMs,
      currentPeriod: 1,
      clock: createInitialClock(),
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    };
    const roster: MatchPlayer[] = input.squadIds.map((playerId) => ({
      matchId: match.id,
      playerId,
      starter: input.starterIds.includes(playerId),
      onField: input.starterIds.includes(playerId),
      createdAt: now,
      updatedAt: now,
    }));
    try {
      await db.transaction("rw", db.matches, db.matchPlayers, db.clockStates, async () => {
        await db.matches.put(match);
        await db.matchPlayers.bulkPut(roster);
        await db.clockStates.put({ ...match.clock, matchId: match.id, updatedAt: now });
      });
    } catch (error) {
      throw toLocalWriteError(error, "The match was not written to this iPad.");
    }
    return match;
  }

  async get(id: string): Promise<Match | undefined> {
    return db.matches.get(id);
  }

  async list(): Promise<Match[]> {
    return db.matches.orderBy("date").reverse().toArray();
  }

  async active(): Promise<Match | undefined> {
    const matches = await db.matches.orderBy("updatedAt").reverse().toArray();
    return (
      matches.find((match) => match.status !== "FINISHED" && match.status !== "NOT_STARTED") ??
      matches.find((match) => match.status !== "FINISHED")
    );
  }

  async unfinished(): Promise<Match | undefined> {
    const matches = await db.matches.orderBy("updatedAt").reverse().toArray();
    return matches.find((match) => match.status !== "FINISHED");
  }

  async hasInProgressMatch(): Promise<boolean> {
    const match = await this.active();
    return Boolean(match && match.status !== "FINISHED");
  }

  async deleteMatch(id: string): Promise<void> {
    try {
      await db.transaction("rw", db.matches, db.matchPlayers, db.events, db.clockStates, async () => {
        await db.matches.delete(id);
        await db.matchPlayers.where("matchId").equals(id).delete();
        await db.events.where("matchId").equals(id).delete();
        await db.clockStates.delete(id);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The match could not be deleted on this iPad.");
    }
  }

  async roster(matchId: string): Promise<{ onField: Player[]; bench: Player[] }> {
    const assignments = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    const players = await db.players.bulkGet(assignments.map((item) => item.playerId));
    const byId = new Map(players.filter((player): player is Player => Boolean(player)).map((player) => [player.id, player]));
    const onField: Player[] = [];
    const bench: Player[] = [];
    for (const assignment of assignments) {
      const player = byId.get(assignment.playerId);
      if (!player) {
        continue;
      }
      if (assignment.onField) {
        onField.push(player);
      } else {
        bench.push(player);
      }
    }
    onField.sort((a, b) => a.number - b.number);
    bench.sort((a, b) => a.number - b.number);
    return { onField, bench };
  }
}

export const matchService = new MatchPersistence();
