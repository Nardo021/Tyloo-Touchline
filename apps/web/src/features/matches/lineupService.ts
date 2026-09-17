import {
  applyGoalkeeperChangeToRuntime,
  applyGoalkeeperToSlots,
  applySubstitutionToRuntime,
  applySubstitutionToSquad,
  createFormationSnapshot,
  createId,
  createMatchRuntimeState,
  displayedElapsedMs,
  goalkeeperIdFromSlots,
  inheritSlotOnSubstitution,
  inferInitialGoalkeeper,
  isLatestLineupEvent,
  latestLineupGroup,
  revertSubstitutionOnSquad,
  validateLiveRuntimeState,
  type GoalkeeperChangeEvent,
  type LineupDraft,
  type LineupSlot,
  type Match,
  type MatchEvent,
  type MatchRuntimeState,
  type SubstitutionEvent,
} from "@tyloo/shared";
import { db } from "../../db/database";
import { getDeviceId } from "../../lib/device";
import { toLocalWriteError } from "../../lib/localWrite";

export interface LineupMutationResult {
  events: MatchEvent[];
  runtime: MatchRuntimeState;
  match?: Match;
}

export class LineupService {
  async getDraft(matchId: string): Promise<LineupDraft | undefined> {
    return db.lineupDrafts.get(matchId);
  }

  async saveDraft(draft: LineupDraft): Promise<LineupDraft> {
    const next = { ...draft, updatedAt: Date.now() };
    try {
      await db.lineupDrafts.put(next);
    } catch (error) {
      throw toLocalWriteError(error, "The half-time setup was not written to this iPad.");
    }
    return next;
  }

  async getRuntime(matchId: string): Promise<MatchRuntimeState | undefined> {
    return db.matchRuntimeStates.get(matchId);
  }

  async requireRuntime(matchId: string): Promise<MatchRuntimeState> {
    const stored = await this.getRuntime(matchId);
    if (stored) {
      return stored;
    }
    const match = await db.matches.get(matchId);
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    return createMatchRuntimeState(
      matchId,
      roster.filter((player) => player.onField).map((player) => player.playerId),
      match?.startingGoalkeeperId ?? inferInitialGoalkeeper(await db.events.where("matchId").equals(matchId).toArray(), "") ?? "",
      match?.clock.period ?? 1,
      Date.now(),
    );
  }

  async recordSubstitution(
    matchId: string,
    playerOffId: string,
    playerOnId: string,
    nextGoalkeeperId?: string,
    nextSlots?: LineupSlot[],
  ): Promise<LineupMutationResult> {
    const match = await requireMatch(matchId);
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    const runtime = await this.requireRuntime(matchId);
    const now = Date.now();
    const nextRuntime = applySubstitutionToRuntime(runtime, playerOffId, playerOnId, now, nextGoalkeeperId);
    const squadIds = roster.map((player) => player.playerId);
    assertLiveRuntime(squadIds, nextRuntime);

    const substitution = await this.buildSubstitution(match, playerOffId, playerOnId, now);
    const events: MatchEvent[] = [substitution];
    if (playerOffId === runtime.goalkeeperId) {
      const goalkeeperId = nextRuntime.goalkeeperId;
      events.push(await this.buildGoalkeeperChange(match, runtime.goalkeeperId, goalkeeperId, now));
    }

    const previousSnapshot = runtime.formationSnapshotId
      ? await db.formationSnapshots.get(runtime.formationSnapshotId)
      : undefined;
    let persistedRuntime = nextRuntime;
    const nextRoster = applySubstitutionToSquad(roster, playerOffId, playerOnId, now);
    try {
      await db.transaction("rw", db.events, db.matchPlayers, db.matchRuntimeStates, db.formationSnapshots, async () => {
        if (previousSnapshot) {
          const resolvedSlots = nextSlots ?? slotsAfterSubstitution(
            previousSnapshot.slots,
            playerOffId,
            playerOnId,
            nextRuntime.goalkeeperId,
          );
          const snapshot = createFormationSnapshot({
            id: createId(),
            matchId,
            period: match.clock.period,
            formation: previousSnapshot.formation,
            effectiveMatchTimeMs: displayedElapsedMs(match.clock, now),
            slots: resolvedSlots,
            createdAt: now,
          });
          persistedRuntime = { ...nextRuntime, formationSnapshotId: snapshot.id };
          await db.formationSnapshots.put(snapshot);
        }
        for (const event of events) {
          await db.events.put(event);
        }
        await db.matchPlayers.bulkPut(nextRoster);
        await db.matchRuntimeStates.put(persistedRuntime);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The substitution was not written to this iPad.");
    }
    return { events, runtime: persistedRuntime };
  }

  async recordGoalkeeperChange(matchId: string, newGoalkeeperId: string): Promise<LineupMutationResult> {
    const match = await requireMatch(matchId);
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    const runtime = await this.requireRuntime(matchId);
    const now = Date.now();
    const nextRuntime = applyGoalkeeperChangeToRuntime(runtime, newGoalkeeperId, now);
    assertLiveRuntime(roster.map((player) => player.playerId), nextRuntime);
    const event = await this.buildGoalkeeperChange(match, runtime.goalkeeperId, newGoalkeeperId, now);
    const previousSnapshot = runtime.formationSnapshotId
      ? await db.formationSnapshots.get(runtime.formationSnapshotId)
      : undefined;
    let persistedRuntime = nextRuntime;

    try {
      await db.transaction("rw", db.events, db.matchRuntimeStates, db.formationSnapshots, async () => {
        if (previousSnapshot) {
          const snapshot = createFormationSnapshot({
            id: createId(),
            matchId,
            period: match.clock.period,
            formation: previousSnapshot.formation,
            effectiveMatchTimeMs: displayedElapsedMs(match.clock, now),
            slots: applyGoalkeeperToSlots(previousSnapshot.slots, newGoalkeeperId),
            createdAt: now,
          });
          persistedRuntime = { ...nextRuntime, formationSnapshotId: snapshot.id };
          await db.formationSnapshots.put(snapshot);
        }
        await db.events.put(event);
        await db.matchRuntimeStates.put(persistedRuntime);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The goalkeeper change was not written to this iPad.");
    }
    return { events: [event], runtime: persistedRuntime };
  }

  async assignMissingGoalkeeper(matchId: string, goalkeeperId: string): Promise<MatchRuntimeState> {
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    const runtime = await this.requireRuntime(matchId);
    if (runtime.goalkeeperId) {
      throw toLocalWriteError(new Error("gk-set"), "This match already has a goalkeeper.");
    }
    const nextRuntime = { ...runtime, goalkeeperId, updatedAt: Date.now() };
    assertLiveRuntime(roster.map((player) => player.playerId), nextRuntime);
    const match = await requireMatch(matchId);
    try {
      await db.transaction("rw", db.matchRuntimeStates, db.matches, async () => {
        await db.matchRuntimeStates.put(nextRuntime);
        if (!match.startingGoalkeeperId) {
          await db.matches.put({ ...match, startingGoalkeeperId: goalkeeperId, updatedAt: nextRuntime.updatedAt });
        }
      });
    } catch (error) {
      throw toLocalWriteError(error, "The goalkeeper was not written to this iPad.");
    }
    return nextRuntime;
  }

  async buildPublicSubstitution(
    matchId: string,
    playerOffId: string,
    playerOnId: string,
    now: number,
    matchTimeMs: number,
    period: number,
  ): Promise<SubstitutionEvent> {
    const match = await requireMatch(matchId);
    return this.buildSubstitution(match, playerOffId, playerOnId, now, matchTimeMs, period);
  }

  async buildPublicGoalkeeperChange(
    matchId: string,
    previousGoalkeeperId: string,
    newGoalkeeperId: string,
    now: number,
    matchTimeMs: number,
    period: number,
  ): Promise<GoalkeeperChangeEvent> {
    const match = await requireMatch(matchId);
    return this.buildGoalkeeperChange(match, previousGoalkeeperId, newGoalkeeperId, now, matchTimeMs, period);
  }

  async voidIfLatestLineupChange(event: MatchEvent): Promise<MatchEvent[]> {
    const events = await db.events.where("matchId").equals(event.matchId).toArray();
    if (!isLatestLineupEvent(events, event.id)) {
      return [];
    }
    const group = latestLineupGroup(events);
    const now = Date.now();
    const roster = await db.matchPlayers.where("matchId").equals(event.matchId).toArray();
    const runtime = await this.requireRuntime(event.matchId);
    let nextRuntime = runtime;
    let nextRoster = roster;

    const ordered = [...group].reverse();
    for (const item of ordered) {
      if (item.type === "GOALKEEPER_CHANGE") {
        nextRuntime = { ...nextRuntime, goalkeeperId: item.previousGoalkeeperId, updatedAt: now };
      }
      if (item.type === "FORMATION_CHANGE" || item.type === "LINEUP_CHANGE") {
        nextRuntime = { ...nextRuntime, formationSnapshotId: item.previousSnapshotId, updatedAt: now };
      }
      if (item.type === "SUBSTITUTION") {
        nextRuntime = {
          ...nextRuntime,
          onFieldPlayerIds: nextRuntime.onFieldPlayerIds.map((id) => (
            id === item.playerOnId ? item.playerOffId : id
          )),
          updatedAt: now,
        };
        nextRoster = revertSubstitutionOnSquad(nextRoster, item.playerOffId, item.playerOnId, now);
      }
    }

    const voided = group.map((item) => ({ ...item, status: "VOIDED" as const, updatedAt: now }));
    const groupStart = Math.min(...group.map((item) => item.createdAt));
    try {
      await db.transaction("rw", db.events, db.matchPlayers, db.matchRuntimeStates, db.formationSnapshots, async () => {
        for (const item of voided) {
          await db.events.put(item);
        }
        const snapshots = await db.formationSnapshots.where("matchId").equals(event.matchId).toArray();
        for (const snapshot of snapshots) {
          if (snapshot.status !== "VOIDED" && snapshot.createdAt >= groupStart) {
            await db.formationSnapshots.put({ ...snapshot, status: "VOIDED" });
          }
        }
        const remaining = snapshots
          .filter((snapshot) => snapshot.status !== "VOIDED" && snapshot.createdAt < groupStart)
          .sort((left, right) => left.createdAt - right.createdAt);
        nextRuntime = {
          ...nextRuntime,
          formationSnapshotId: remaining[remaining.length - 1]?.id ?? "",
          updatedAt: now,
        };
        await db.matchPlayers.bulkPut(nextRoster);
        await db.matchRuntimeStates.put(nextRuntime);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The event could not be voided on this iPad.");
    }
    return voided;
  }

  private async buildSubstitution(
    match: Match,
    playerOffId: string,
    playerOnId: string,
    now: number,
    matchTimeMs = displayedElapsedMs(match.clock, now),
    period = match.clock.period,
  ): Promise<SubstitutionEvent> {
    return {
      ...(await this.baseEvent(match.id, now, period, matchTimeMs)),
      type: "SUBSTITUTION",
      playerId: null,
      playerOffId,
      playerOnId,
    };
  }

  private async buildGoalkeeperChange(
    match: Match,
    previousGoalkeeperId: string,
    newGoalkeeperId: string,
    now: number,
    matchTimeMs = displayedElapsedMs(match.clock, now),
    period = match.clock.period,
  ): Promise<GoalkeeperChangeEvent> {
    return {
      ...(await this.baseEvent(match.id, now, period, matchTimeMs)),
      type: "GOALKEEPER_CHANGE",
      playerId: null,
      previousGoalkeeperId,
      newGoalkeeperId,
    };
  }

  private async baseEvent(matchId: string, now: number, period: number, matchTimeMs: number) {
    return {
      id: createId(),
      matchId,
      period,
      matchTimeMs,
      createdAt: now,
      updatedAt: now,
      deviceId: await getDeviceId(),
      status: "ACTIVE" as const,
    };
  }
}

function assertLiveRuntime(squadPlayerIds: string[], runtime: MatchRuntimeState): void {
  const result = validateLiveRuntimeState({
    squadPlayerIds,
    onFieldPlayerIds: runtime.onFieldPlayerIds,
    goalkeeperId: runtime.goalkeeperId,
  });
  if (!result.ok) {
    throw toLocalWriteError(new Error(result.errors.join(" ")), result.errors[0] ?? "The match lineup is not valid.");
  }
}

function slotsAfterSubstitution(
  slots: LineupSlot[],
  playerOffId: string,
  playerOnId: string,
  goalkeeperId: string,
): LineupSlot[] {
  const inherited = inheritSlotOnSubstitution(slots, playerOffId, playerOnId);
  if (goalkeeperIdFromSlotsSafe(inherited) === goalkeeperId) {
    return inherited;
  }
  return applyGoalkeeperToSlots(inherited, goalkeeperId);
}

function goalkeeperIdFromSlotsSafe(slots: LineupSlot[]): string {
  return goalkeeperIdFromSlots(slots);
}

async function requireMatch(matchId: string): Promise<Match> {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw toLocalWriteError(new Error("missing"), "That match is no longer on this device.");
  }
  return match;
}

export const lineupService = new LineupService();
