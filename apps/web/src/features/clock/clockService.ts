import {
  applyClockTransition,
  createInitialClock,
  displayedElapsedMs,
  matchStatusFromClock,
  type ClockTransitionKind,
  type Match,
  type MatchClockState,
  type MatchControlEvent,
} from "@tyloo/shared";
import { createId } from "@tyloo/shared";
import { db } from "../../db/database";
import { getDeviceId } from "../../lib/device";
import { enqueueMutation } from "../sync/syncQueue";

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
      throw new Error("That match is no longer on this device.");
    }
    const next: Match = {
      ...match,
      ...extra,
      clock,
      currentPeriod: clock.period,
      status: matchStatusFromClock(clock.phase),
      updatedAt: Date.now(),
    };
    await db.transaction("rw", db.matches, db.clockStates, async () => {
      await db.matches.put(next);
      await db.clockStates.put({ ...clock, matchId, updatedAt: next.updatedAt });
    });
    return next;
  }

  async transition(matchId: string, kind: ClockTransitionKind, now = Date.now()): Promise<Match> {
    const match = await db.matches.get(matchId);
    if (!match) {
      throw new Error("That match is no longer on this device.");
    }
    const clock = applyClockTransition(match.clock, kind, now, match.periodCount);
    const extra: Partial<Match> = {};
    if (kind === "START") {
      extra.startedAt = match.startedAt ?? now;
    }
    if (kind === "END_MATCH") {
      extra.finishedAt = now;
    }
    const next = await this.persist(matchId, clock, extra);
    await enqueueMutation({
      id: createId(),
      kind: "CLOCK_TRANSITION",
      payload: { matchId, kind, clock, at: now },
    });
    await enqueueMutation({
      id: createId(),
      kind: "UPSERT_MATCH",
      payload: next,
    });
    await this.recordControlEvent(next, kind, now);
    return next;
  }

  private async recordControlEvent(match: Match, kind: ClockTransitionKind, now: number): Promise<void> {
    const type = controlType(kind);
    if (!type) {
      return;
    }
    const deviceId = await getDeviceId();
    const event: MatchControlEvent = {
      id: createId(),
      matchId: match.id,
      type,
      playerId: null,
      period: match.clock.period,
      matchTimeMs: displayedElapsedMs(match.clock, now),
      createdAt: now,
      updatedAt: now,
      deviceId,
      status: "ACTIVE",
    };
    await db.events.put(event);
    await enqueueMutation({ id: createId(), kind: "UPSERT_EVENT", payload: event });
  }
}

function controlType(
  kind: ClockTransitionKind,
): MatchControlEvent["type"] | null {
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
