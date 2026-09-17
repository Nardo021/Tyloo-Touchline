import {
  applyClockTransition,
  applyRuntimeToSquad,
  createFormationSnapshot,
  createId,
  createMatchRuntimeState,
  deriveLineupChanges,
  displayedElapsedMs,
  matchStatusFromRunning,
  resolveMatchPhase,
  reviewLineupChange,
  validateHalftimePairs,
  validateLineup,
  validateRuntimeState,
  type FormationChangeEvent,
  type FormationSnapshot,
  type FormationType,
  type LineupChangeEvent,
  type LineupSlot,
  type Match,
  type MatchControlEvent,
  type MatchEvent,
  type MatchPhase,
  type MatchRuntimeState,
  type SubstitutionPair,
} from "@tyloo/shared";
import { db } from "../../db/database";
import { getDeviceId } from "../../lib/device";
import { toLocalWriteError } from "../../lib/localWrite";
import { lineupService } from "./lineupService";

export interface LifecycleResult {
  match: Match;
  runtime: MatchRuntimeState;
  snapshot?: FormationSnapshot;
  events: MatchEvent[];
}

export class LifecycleService {
  async startFirstHalf(input: {
    matchId: string;
    formation: FormationType;
    slots: LineupSlot[];
    now?: number;
  }): Promise<LifecycleResult> {
    return this.commitPeriodStart({ ...input, period: 1, pairs: [] });
  }

  async startSecondHalf(input: {
    matchId: string;
    formation: FormationType;
    slots: LineupSlot[];
    pairs: SubstitutionPair[];
    now?: number;
  }): Promise<LifecycleResult> {
    return this.commitPeriodStart({ ...input, period: 2 });
  }

  async commitPeriodStart(input: {
    matchId: string;
    period: 1 | 2;
    formation: FormationType;
    slots: LineupSlot[];
    pairs?: SubstitutionPair[];
    now?: number;
  }): Promise<LifecycleResult> {
    const now = input.now ?? Date.now();
    const match = await requireMatch(input.matchId);
    const phase = resolveMatchPhase(match);
    const pairs = input.pairs ?? [];
    if (input.period === 1) {
      if (phase !== "PRE_MATCH") {
        throw toLocalWriteError(new Error("not-prematch"), "The first half has already started.");
      }
    } else if (phase !== "HALF_TIME") {
      throw toLocalWriteError(new Error("not-halftime"), "The next period can only start from half-time.");
    }

    const roster = await db.matchPlayers.where("matchId").equals(input.matchId).toArray();
    const squadIds = roster.map((item) => item.playerId);
    const formationResult = validateLineup(input.formation, input.slots, squadIds);
    if (!formationResult.ok) {
      throw toLocalWriteError(new Error(formationResult.errors.join(" ")), formationResult.errors[0] ?? "The formation is not valid.");
    }
    const onFieldPlayerIds = formationResult.onFieldPlayerIds;
    const goalkeeperId = formationResult.goalkeeperId;
    const runtimeResult = validateRuntimeState({
      squadPlayerIds: squadIds,
      onFieldPlayerIds,
      goalkeeperId,
    });
    if (!runtimeResult.ok) {
      throw toLocalWriteError(new Error(runtimeResult.errors.join(" ")), runtimeResult.errors[0] ?? "The match lineup is not valid.");
    }

    const previousRuntime = input.period === 2 ? await lineupService.requireRuntime(input.matchId) : undefined;
    if (previousRuntime && !validateHalftimePairs(previousRuntime.onFieldPlayerIds, onFieldPlayerIds, pairs)) {
      throw toLocalWriteError(new Error("pairs"), "Half-time substitutions do not match the selected lineup.");
    }

    const previousSnapshot = previousRuntime?.formationSnapshotId
      ? await db.formationSnapshots.get(previousRuntime.formationSnapshotId)
      : undefined;
    const snapshot = createFormationSnapshot({
      id: createId(),
      matchId: input.matchId,
      period: input.period,
      formation: input.formation,
      effectiveMatchTimeMs: 0,
      slots: input.slots,
      createdAt: now,
    });
    const events: MatchEvent[] = [];
    if (previousRuntime) {
      for (const pair of pairs) {
        events.push(await lineupService.buildPublicSubstitution(input.matchId, pair.playerOffId, pair.playerOnId, now, 0, input.period));
      }
      if (previousRuntime.goalkeeperId && previousRuntime.goalkeeperId !== goalkeeperId) {
        events.push(await lineupService.buildPublicGoalkeeperChange(input.matchId, previousRuntime.goalkeeperId, goalkeeperId, now, 0, input.period));
      }
      const review = reviewLineupChange(
        previousSnapshot ? { formation: previousSnapshot.formation, slots: previousSnapshot.slots } : null,
        { formation: input.formation, slots: input.slots },
      );
      if (review.formationChanged && previousSnapshot) {
        events.push(await formationChangeEvent(input.matchId, previousSnapshot, snapshot, now, input.period, 0));
      } else if (previousSnapshot && lineupChanged(previousSnapshot.slots, input.slots)) {
        events.push(await lineupChangeEvent(input.matchId, previousSnapshot, snapshot, now, input.period, 0));
      }
    }

    const clock = applyClockTransition(
      match.clock,
      input.period === 1 ? "START" : "START_NEXT_PERIOD",
      now,
      match.periodCount,
    );
    const nextPhase: MatchPhase = input.period === 1 ? "FIRST_HALF" : "SECOND_HALF";
    const nextMatch: Match = {
      ...match,
      clock,
      currentPeriod: input.period,
      phase: nextPhase,
      clockMode: "period-local",
      startingFormation: input.period === 1 ? input.formation : match.startingFormation,
      startingGoalkeeperId: input.period === 1 ? goalkeeperId : match.startingGoalkeeperId,
      status: matchStatusFromRunning(nextPhase, clock.running),
      startedAt: match.startedAt ?? now,
      updatedAt: now,
    };
    const runtime = createMatchRuntimeState(input.matchId, onFieldPlayerIds, goalkeeperId, input.period, now, snapshot.id);
    const nextRoster = applyRuntimeToSquad(roster, onFieldPlayerIds, now);
    const startEvent = await controlEvent(
      nextMatch,
      input.period === 1 ? "MATCH_START" : "PERIOD_START",
      now,
      input.period,
      0,
    );

    try {
      await db.transaction(
        "rw",
        [db.matches, db.clockStates, db.events, db.matchPlayers, db.matchRuntimeStates, db.formationSnapshots, db.lineupDrafts],
        async () => {
          await db.matches.put(nextMatch);
          await db.clockStates.put({ ...clock, matchId: input.matchId, updatedAt: now });
          await db.matchRuntimeStates.put(runtime);
          await db.matchPlayers.bulkPut(nextRoster);
          await db.formationSnapshots.put(snapshot);
          for (const event of events) {
            await db.events.put(event);
          }
          await db.events.put(startEvent);
          await db.lineupDrafts.delete(input.matchId);
        },
      );
    } catch (error) {
      throw toLocalWriteError(
        error,
        input.period === 1 ? "The first half was not written to this iPad." : "The second half was not written to this iPad.",
      );
    }
    return { match: nextMatch, runtime, snapshot, events: [...events, startEvent] };
  }

  async endFirstHalf(matchId: string, now = Date.now()): Promise<LifecycleResult> {
    const match = await requireMatch(matchId);
    if (resolveMatchPhase(match) !== "FIRST_HALF") {
      throw toLocalWriteError(new Error("not-first-half"), "The first half is not running.");
    }
    const elapsed = displayedElapsedMs(match.clock, now);
    const clock = applyClockTransition(match.clock, "END_PERIOD", now, match.periodCount);
    const nextMatch: Match = {
      ...match,
      clock,
      currentPeriod: 1,
      phase: "HALF_TIME",
      periodDurationsMs: [elapsed],
      status: matchStatusFromRunning("HALF_TIME", clock.running),
      updatedAt: now,
    };
    const runtime = await lineupService.requireRuntime(matchId);
    const endEvent = await controlEvent(nextMatch, "PERIOD_END", now, 1, elapsed);
    try {
      await db.transaction("rw", db.matches, db.clockStates, db.events, async () => {
        await db.matches.put(nextMatch);
        await db.clockStates.put({ ...clock, matchId, updatedAt: now });
        await db.events.put(endEvent);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The first half could not be ended on this iPad.");
    }
    return { match: nextMatch, runtime: { ...runtime, period: 1, updatedAt: now }, events: [endEvent] };
  }

  async endMatch(matchId: string, now = Date.now()): Promise<LifecycleResult> {
    const match = await requireMatch(matchId);
    const phase = resolveMatchPhase(match);
    if (phase !== "SECOND_HALF" && phase !== "FIRST_HALF") {
      throw toLocalWriteError(new Error("not-live"), "There is no live half to finish.");
    }
    const elapsed = displayedElapsedMs(match.clock, now);
    const clock = applyClockTransition(match.clock, "END_MATCH", now, match.periodCount);
    const durations = [...(match.periodDurationsMs ?? [])];
    durations[clock.period - 1] = elapsed;
    const nextMatch: Match = {
      ...match,
      clock,
      phase: "FULL_TIME",
      periodDurationsMs: durations,
      status: matchStatusFromRunning("FULL_TIME", clock.running),
      finishedAt: now,
      updatedAt: now,
    };
    const runtime = await lineupService.requireRuntime(matchId);
    const endEvent = await controlEvent(nextMatch, "MATCH_END", now, clock.period, elapsed);
    try {
      await db.transaction("rw", db.matches, db.clockStates, db.events, async () => {
        await db.matches.put(nextMatch);
        await db.clockStates.put({ ...clock, matchId, updatedAt: now });
        await db.events.put(endEvent);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The match could not be ended on this iPad.");
    }
    return { match: nextMatch, runtime: { ...runtime, updatedAt: now }, events: [endEvent] };
  }

  async changeLineup(input: {
    matchId: string;
    formation: FormationType;
    slots: LineupSlot[];
    now?: number;
  }): Promise<LifecycleResult> {
    const now = input.now ?? Date.now();
    const match = await requireMatch(input.matchId);
    const roster = await db.matchPlayers.where("matchId").equals(input.matchId).toArray();
    const runtime = await lineupService.requireRuntime(input.matchId);
    const formationResult = validateLineup(input.formation, input.slots, roster.map((item) => item.playerId));
    if (!formationResult.ok) {
      throw toLocalWriteError(new Error(formationResult.errors.join(" ")), formationResult.errors[0] ?? "The formation is not valid.");
    }
    const onFieldPlayerIds = formationResult.onFieldPlayerIds;
    const goalkeeperId = formationResult.goalkeeperId;
    if (onFieldPlayerIds.slice().sort().join() !== runtime.onFieldPlayerIds.slice().sort().join()) {
      throw toLocalWriteError(new Error("same-six"), "Change lineup keeps the current six players. Use substitution to change who is on the field.");
    }

    const previousSnapshot = runtime.formationSnapshotId
      ? await db.formationSnapshots.get(runtime.formationSnapshotId)
      : undefined;
    const elapsed = displayedElapsedMs(match.clock, now);
    const snapshot = createFormationSnapshot({
      id: createId(),
      matchId: input.matchId,
      period: match.clock.period,
      formation: input.formation,
      effectiveMatchTimeMs: elapsed,
      slots: input.slots,
      createdAt: now,
    });
    const events: MatchEvent[] = [];
    const review = reviewLineupChange(
      previousSnapshot ? { formation: previousSnapshot.formation, slots: previousSnapshot.slots } : null,
      { formation: input.formation, slots: input.slots },
    );
    if (review.formationChanged && previousSnapshot) {
      events.push(await formationChangeEvent(input.matchId, previousSnapshot, snapshot, now, match.clock.period, elapsed));
    } else if (previousSnapshot) {
      events.push(await lineupChangeEvent(input.matchId, previousSnapshot, snapshot, now, match.clock.period, elapsed));
    }
    if (runtime.goalkeeperId && runtime.goalkeeperId !== goalkeeperId) {
      events.push(await lineupService.buildPublicGoalkeeperChange(input.matchId, runtime.goalkeeperId, goalkeeperId, now, elapsed, match.clock.period));
    }
    const nextRuntime = createMatchRuntimeState(input.matchId, onFieldPlayerIds, goalkeeperId, match.clock.period, now, snapshot.id);

    try {
      await db.transaction("rw", db.events, db.matchRuntimeStates, db.formationSnapshots, async () => {
        await db.matchRuntimeStates.put(nextRuntime);
        await db.formationSnapshots.put(snapshot);
        for (const event of events) {
          await db.events.put(event);
        }
      });
    } catch (error) {
      throw toLocalWriteError(error, "The lineup change was not written to this iPad.");
    }
    return { match, runtime: nextRuntime, snapshot, events };
  }
}

function lineupChanged(previous: LineupSlot[], next: LineupSlot[]): boolean {
  const left = [...previous].sort((a, b) => a.order - b.order).map((slot) => `${slot.slotId}:${slot.playerId}`).join("|");
  const right = [...next].sort((a, b) => a.order - b.order).map((slot) => `${slot.slotId}:${slot.playerId}`).join("|");
  return left !== right;
}

async function controlEvent(
  match: Match,
  type: MatchControlEvent["type"],
  now: number,
  period: number,
  matchTimeMs: number,
): Promise<MatchControlEvent> {
  return {
    id: createId(),
    matchId: match.id,
    type,
    playerId: null,
    period,
    matchTimeMs,
    createdAt: now,
    updatedAt: now,
    deviceId: await getDeviceId(),
    status: "ACTIVE",
  };
}

async function formationChangeEvent(
  matchId: string,
  previous: FormationSnapshot,
  next: FormationSnapshot,
  now: number,
  period: number,
  matchTimeMs: number,
): Promise<FormationChangeEvent> {
  return {
    id: createId(),
    matchId,
    type: "FORMATION_CHANGE",
    playerId: null,
    previousFormation: previous.formation,
    newFormation: next.formation,
    previousSnapshotId: previous.id,
    newSnapshotId: next.id,
    period,
    matchTimeMs,
    createdAt: now,
    updatedAt: now,
    deviceId: await getDeviceId(),
    status: "ACTIVE",
  };
}

async function lineupChangeEvent(
  matchId: string,
  previous: FormationSnapshot,
  next: FormationSnapshot,
  now: number,
  period: number,
  matchTimeMs: number,
): Promise<LineupChangeEvent> {
  return {
    id: createId(),
    matchId,
    type: "LINEUP_CHANGE",
    playerId: null,
    formation: next.formation,
    previousSnapshotId: previous.id,
    newSnapshotId: next.id,
    period,
    matchTimeMs,
    createdAt: now,
    updatedAt: now,
    deviceId: await getDeviceId(),
    status: "ACTIVE",
  };
}

async function requireMatch(matchId: string): Promise<Match> {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw toLocalWriteError(new Error("missing"), "That match is no longer on this device.");
  }
  return match;
}

export function derivedHalftimePairs(previousOnFieldIds: string[], nextOnFieldIds: string[]): SubstitutionPair[] {
  return deriveLineupChanges(previousOnFieldIds, nextOnFieldIds).pairs;
}

export const lifecycleService = new LifecycleService();
