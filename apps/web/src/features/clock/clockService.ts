import {
  applyClockTransition,
  createId,
  createInitialClock,
  displayedElapsedMs,
  matchStatusFromClock,
  type ClockTransitionKind,
  type Match,
  type MatchClockState,
  type MatchControlEvent,
} from "@tyloo/shared";
import { db } from "../../db/database";
import { getDeviceId } from "../../lib/device";
import { toLocalWriteError } from "../../lib/localWrite";

export class MatchClockService {
  displayedMs(clock: MatchClockState, now = Date.now()): number {
    return displayedElapsedMs(clock, now);
  }

  async getClock(matchId: string): Promise<MatchClockState> {
    const stored = await db.clockStates.get(matchId);
    if (stored) {
      const { matchId: _matchId, updatedAt: _updatedAt, ...clock } = stored;
      return clock;
    }
    const match = await db.matches.get(matchId);
    return match?.clock ?? createInitialClock();
  }

  async persist(matchId: string, clock: MatchClockState, extra: Partial<Match> = {}): Promise<Match> {
    const match = await db.matches.get(matchId);
    if (!match) {
      throw toLocalWriteError(new Error("missing"), "That match is no longer on this device.");
    }
    const next: Match = {
      ...match,
      ...extra,
      clock,
      currentPeriod: clock.period,
      status: matchStatusFromClock(clock.phase),
      updatedAt: Date.now(),
    };
    try {
      await db.transaction("rw", db.matches, db.clockStates, async () => {
        await db.matches.put(next);
        await db.clockStates.put({ ...clock, matchId, updatedAt: next.updatedAt });
      });
    } catch (error) {
      throw toLocalWriteError(error, "The clock change was not written to this iPad.");
    }
    return next;
  }

  async transition(matchId: string, kind: ClockTransitionKind, now = Date.now()): Promise<Match> {
    const match = await db.matches.get(matchId);
    if (!match) {
      throw toLocalWriteError(new Error("missing"), "That match is no longer on this device.");
    }
    const clock = applyClockTransition(match.clock, kind, now, match.periodCount);
    const extra: Partial<Match> = {};
    if (kind === "START") {
      extra.startedAt = match.startedAt ?? now;
    }
    if (kind === "END_MATCH") {
      extra.finishedAt = now;
    }
    const next: Match = {
      ...match,
      ...extra,
      clock,
      currentPeriod: clock.period,
      status: matchStatusFromClock(clock.phase),
      updatedAt: now,
    };
    const controlEvent = await this.buildControlEvent(next, kind, now);
    try {
      await db.transaction("rw", db.matches, db.clockStates, db.events, async () => {
        await db.matches.put(next);
        await db.clockStates.put({ ...clock, matchId, updatedAt: next.updatedAt });
        if (controlEvent) {
          await db.events.put(controlEvent);
        }
      });
    } catch (error) {
      throw toLocalWriteError(error, "The clock change was not written to this iPad.");
    }
    return next;
  }

  private async buildControlEvent(
    match: Match,
    kind: ClockTransitionKind,
    now: number,
  ): Promise<MatchControlEvent | null> {
    const type = controlType(kind);
    if (!type) {
      return null;
    }
    return {
      id: createId(),
      matchId: match.id,
      type,
      playerId: null,
      period: match.clock.period,
      matchTimeMs: displayedElapsedMs(match.clock, now),
      createdAt: now,
      updatedAt: now,
      deviceId: await getDeviceId(),
      status: "ACTIVE",
    };
  }
}

function controlType(kind: ClockTransitionKind): MatchControlEvent["type"] | null {
  switch (kind) {
    case "START":
      return "MATCH_START";
    case "PAUSE":
      return "MATCH_PAUSE";
    case "RESUME":
      return "MATCH_RESUME";
    case "END_PERIOD":
      return "PERIOD_END";
    case "START_NEXT_PERIOD":
      return "PERIOD_START";
    case "END_MATCH":
      return "MATCH_END";
    case "RESET":
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export const clockService = new MatchClockService();
