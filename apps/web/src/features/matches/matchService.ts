import {
  createId,
  createInitialClock,
  createMatchRuntimeState,
  DEFAULT_TEAM_ID,
  validateLineupSlots,
  validateRuntimeState,
  type FormationType,
  type LineupDraft,
  type LineupSlot,
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
  goalkeeperId: string;
  formation?: FormationType;
  slots?: LineupSlot[];
}

export class MatchPersistence {
  async create(input: CreateMatchInput): Promise<Match> {
    const validation = validateRuntimeState({
      squadPlayerIds: input.squadIds,
      onFieldPlayerIds: input.starterIds,
      goalkeeperId: input.goalkeeperId,
    });
    if (!validation.ok) {
      throw toLocalWriteError(new Error(validation.errors.join(" ")), validation.errors[0] ?? "The starting lineup is not valid.");
    }
    const settings = await getAppSettings();
    const now = Date.now();
    const match: Match = {
      id: createId(),
      teamId: DEFAULT_TEAM_ID,
      opponent: input.opponent.trim(),
      competition: input.competition.trim() || settings.teamName,
      date: input.date,
      status: "NOT_STARTED",
      phase: "PRE_MATCH",
      clockMode: "period-local",
      startingFormation: input.formation ?? null,
      periodDurationsMs: [],
      periodCount: input.periodCount,
      periodLengthMs: input.periodLengthMs,
      currentPeriod: 1,
      clock: createInitialClock(),
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      startingGoalkeeperId: input.goalkeeperId,
    };
    const roster: MatchPlayer[] = input.squadIds.map((playerId) => ({
      matchId: match.id,
      playerId,
      starter: input.starterIds.includes(playerId),
      onField: input.starterIds.includes(playerId),
      createdAt: now,
      updatedAt: now,
    }));
    if (input.formation && input.slots) {
      const formationResult = validateLineupSlots(input.formation, input.slots, input.starterIds, input.goalkeeperId);
      if (!formationResult.ok) {
        throw toLocalWriteError(new Error(formationResult.errors.join(" ")), formationResult.errors[0] ?? "The starting formation is not valid.");
      }
    }
    const draft: LineupDraft | null = input.formation && input.slots
      ? {
          matchId: match.id,
          purpose: "PRE_MATCH",
          formation: input.formation,
          slots: input.slots,
          onFieldPlayerIds: input.starterIds,
          goalkeeperId: input.goalkeeperId,
          updatedAt: now,
        }
      : null;
    try {
      await db.transaction("rw", db.matches, db.matchPlayers, db.clockStates, db.matchRuntimeStates, db.lineupDrafts, async () => {
        await db.matches.put(match);
        await db.matchPlayers.bulkPut(roster);
        await db.clockStates.put({ ...match.clock, matchId: match.id, updatedAt: now });
        await db.matchRuntimeStates.put(
          createMatchRuntimeState(match.id, input.starterIds, input.goalkeeperId, 1, now),
        );
        if (draft) {
          await db.lineupDrafts.put(draft);
        }
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
    return matches.find((match) => match.phase !== "FULL_TIME" && match.status !== "FINISHED");
  }

  async unfinished(): Promise<Match | undefined> {
    const matches = await db.matches.orderBy("updatedAt").reverse().toArray();
    return matches.find((match) => match.phase !== "FULL_TIME" && match.status !== "FINISHED");
  }

  async hasInProgressMatch(): Promise<boolean> {
    const match = await this.active();
    return Boolean(match && match.status !== "FINISHED");
  }

  async deleteMatch(id: string): Promise<void> {
    try {
      await db.transaction("rw", [db.matches, db.matchPlayers, db.events, db.clockStates, db.matchRuntimeStates, db.formationSnapshots, db.lineupDrafts], async () => {
        await db.matches.delete(id);
        await db.matchPlayers.where("matchId").equals(id).delete();
        await db.events.where("matchId").equals(id).delete();
        await db.clockStates.delete(id);
        await db.matchRuntimeStates.delete(id);
        await db.formationSnapshots.where("matchId").equals(id).delete();
        await db.lineupDrafts.delete(id);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The match could not be deleted on this iPad.");
    }
  }

  async roster(matchId: string): Promise<{ onField: Player[]; bench: Player[]; goalkeeperId: string | null }> {
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
    const runtime = await db.matchRuntimeStates.get(matchId);
    return { onField, bench, goalkeeperId: runtime?.goalkeeperId || null };
  }
}

export const matchService = new MatchPersistence();
