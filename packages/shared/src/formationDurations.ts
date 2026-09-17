import type { FormationSnapshot, TacticalRole } from "./formation.js";
import { goalkeeperIdFromSlots, sortFormationSnapshots } from "./formation.js";

export interface RoleDuration {
  playerId: string;
  role: TacticalRole;
  period: number;
  durationMs: number;
}

export function calculateRoleDurations(args: {
  snapshots: FormationSnapshot[];
  playerId?: string;
  period?: number;
  periodDurationsMs: number[];
}): RoleDuration[] {
  const sorted = sortFormationSnapshots(args.snapshots).filter((snapshot) =>
    args.period == null ? true : snapshot.period === args.period,
  );
  const totals = new Map<string, RoleDuration>();

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!current) {
      continue;
    }
    const next = sorted[index + 1];
    const periodLength = args.periodDurationsMs[current.period - 1] ?? 0;
    const endMs = next && next.period === current.period ? next.effectiveMatchTimeMs : periodLength;
    const duration = Math.max(0, endMs - current.effectiveMatchTimeMs);
    if (duration === 0) {
      continue;
    }
    for (const slot of current.slots) {
      if (args.playerId && slot.playerId !== args.playerId) {
        continue;
      }
      const key = `${slot.playerId}:${slot.role}:${current.period}`;
      const existing = totals.get(key);
      if (existing) {
        existing.durationMs += duration;
      } else {
        totals.set(key, {
          playerId: slot.playerId,
          role: slot.role,
          period: current.period,
          durationMs: duration,
        });
      }
    }
  }

  return [...totals.values()];
}

export interface GoalkeeperStint {
  playerId: string;
  period: number;
  fromMs: number;
  toMs: number;
}

export function calculateGoalkeeperStints(args: {
  snapshots: FormationSnapshot[];
  periodDurationsMs: number[];
}): GoalkeeperStint[] {
  const sorted = sortFormationSnapshots(args.snapshots);
  const stints: GoalkeeperStint[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!current) {
      continue;
    }
    const goalkeeperId = goalkeeperIdFromSlots(current.slots);
    if (!goalkeeperId) {
      continue;
    }
    const next = sorted[index + 1];
    const periodLength = args.periodDurationsMs[current.period - 1] ?? 0;
    const toMs = next && next.period === current.period ? next.effectiveMatchTimeMs : periodLength;
    const previous = stints[stints.length - 1];
    if (
      previous
      && previous.playerId === goalkeeperId
      && previous.period === current.period
      && previous.toMs === current.effectiveMatchTimeMs
    ) {
      previous.toMs = toMs;
    } else {
      stints.push({
        playerId: goalkeeperId,
        period: current.period,
        fromMs: current.effectiveMatchTimeMs,
        toMs,
      });
    }
  }
  return stints;
}
