import {
  calculateGoalkeeperStints,
  calculatePeriodStats,
  deriveMatchReport,
  calculateRoleDurations,
  displayedElapsedMs,
  getFullTimeScore,
  getPeriodResult,
  inferInitialGoalkeeper,
  sortEventsChronologically,
  sortFormationSnapshots,
  startingSnapshotForPeriod,
  type FormationSnapshot,
  type GoalkeeperChangeEvent,
  type GoalkeeperStint,
  type Match,
  type MatchEvent,
  type MatchReport,
  type PeriodResult,
  type RoleDuration,
  type SubstitutionEvent,
} from "@tyloo/shared";
import { db } from "../../db/database";

export interface PeriodSummary {
  period: 1 | 2;
  result: PeriodResult;
  playedMs: number;
  report: MatchReport;
  startingSnapshot: FormationSnapshot | null;
  formationHistory: FormationSnapshot[];
  timeline: MatchEvent[];
  roleDurations: RoleDuration[];
}

export interface FullMatchSummary {
  fullTime: { for: number; against: number };
  firstHalf: PeriodResult;
  secondHalf: PeriodResult;
  combined: MatchReport;
  firstHalfReport: MatchReport;
  secondHalfReport: MatchReport;
  snapshots: FormationSnapshot[];
  roleDurations: RoleDuration[];
  goalkeeperStints: GoalkeeperStint[];
  substitutions: SubstitutionEvent[];
  goalkeeperChanges: GoalkeeperChangeEvent[];
}

export async function buildMatchReport(matchId: string, period?: 1 | 2): Promise<MatchReport> {
  const context = await loadReportContext(matchId);
  if (!context.match) {
    return deriveMatchReport(context.events, context.playerIds);
  }
  if (period) {
    return calculatePeriodStats(context.events, period, context.playerIds, periodContext(context, period));
  }
  return deriveMatchReport(context.events, context.playerIds, fullContext(context));
}

export async function buildPeriodSummary(matchId: string, period: 1 | 2): Promise<PeriodSummary | null> {
  const context = await loadReportContext(matchId);
  if (!context.match) {
    return null;
  }
  const report = calculatePeriodStats(context.events, period, context.playerIds, periodContext(context, period));
  const snapshots = context.snapshots.filter((snapshot) => snapshot.period === period);
  const playedMs = periodDuration(context.match, period, context.now);
  return {
    period,
    result: getPeriodResult(context.events, period),
    playedMs,
    report,
    startingSnapshot: startingSnapshotForPeriod(context.snapshots, period),
    formationHistory: sortFormationSnapshots(snapshots),
    timeline: sortEventsChronologically(context.events.filter((event) => event.period === period && event.status === "ACTIVE")),
    roleDurations: calculateRoleDurations({
      snapshots: context.snapshots,
      period,
      periodDurationsMs: [
        periodDuration(context.match, 1, context.now),
        periodDuration(context.match, 2, context.now),
      ],
    }),
  };
}

export async function buildFullMatchSummary(matchId: string): Promise<FullMatchSummary | null> {
  const context = await loadReportContext(matchId);
  if (!context.match) {
    return null;
  }
  const firstHalfReport = calculatePeriodStats(context.events, 1, context.playerIds, periodContext(context, 1));
  const secondHalfReport = calculatePeriodStats(context.events, 2, context.playerIds, periodContext(context, 2));
  const combined = deriveMatchReport(context.events, context.playerIds, fullContext(context));
  return {
    fullTime: getFullTimeScore(context.events),
    firstHalf: getPeriodResult(context.events, 1),
    secondHalf: getPeriodResult(context.events, 2),
    combined,
    firstHalfReport,
    secondHalfReport,
    snapshots: sortFormationSnapshots(context.snapshots),
    roleDurations: calculateRoleDurations({
      snapshots: context.snapshots,
      periodDurationsMs: [
        periodDuration(context.match, 1, context.now),
        periodDuration(context.match, 2, context.now),
      ],
    }),
    goalkeeperStints: calculateGoalkeeperStints({
      snapshots: context.snapshots,
      periodDurationsMs: [
        periodDuration(context.match, 1, context.now),
        periodDuration(context.match, 2, context.now),
      ],
    }),
    substitutions: context.events.filter((event): event is SubstitutionEvent => event.type === "SUBSTITUTION" && event.status === "ACTIVE"),
    goalkeeperChanges: context.events.filter((event): event is GoalkeeperChangeEvent => event.type === "GOALKEEPER_CHANGE" && event.status === "ACTIVE"),
  };
}

interface LoadedContext {
  match?: Match;
  events: MatchEvent[];
  playerIds: string[];
  starterIds: string[];
  snapshots: FormationSnapshot[];
  initialGoalkeeperId: string | null;
  now: number;
}

async function loadReportContext(matchId: string): Promise<LoadedContext> {
  const [match, events, roster, runtime, snapshots] = await Promise.all([
    db.matches.get(matchId),
    db.events.where("matchId").equals(matchId).toArray(),
    db.matchPlayers.where("matchId").equals(matchId).toArray(),
    db.matchRuntimeStates.get(matchId),
    db.formationSnapshots.where("matchId").equals(matchId).toArray(),
  ]);
  const now = Date.now();
  return {
    match,
    events,
    playerIds: roster.map((item) => item.playerId),
    starterIds: roster.filter((item) => item.starter).map((item) => item.playerId),
    snapshots,
    initialGoalkeeperId: match?.startingGoalkeeperId ?? inferInitialGoalkeeper(events, runtime?.goalkeeperId || null),
    now,
  };
}

function fullContext(context: LoadedContext) {
  const match = context.match;
  if (!match) {
    return undefined;
  }
  return {
    starterIds: context.starterIds,
    initialGoalkeeperId: context.initialGoalkeeperId,
    matchEnd: {
      period: match.clock.period,
      matchTimeMs: match.finishedAt ? match.clock.accumulatedMs : displayedElapsedMs(match.clock, context.now),
    },
    clockMode: match.clockMode,
    periodLengthMs: match.periodLengthMs,
    periodDurationsMs: match.periodDurationsMs,
  };
}

function periodContext(context: LoadedContext, period: 1 | 2) {
  const match = context.match;
  if (!match) {
    return {
      starterIds: context.starterIds,
      initialGoalkeeperId: context.initialGoalkeeperId,
      matchEnd: { period, matchTimeMs: 0 },
      clockMode: "period-local" as const,
    };
  }
  return {
    starterIds: context.starterIds,
    initialGoalkeeperId: context.initialGoalkeeperId,
    matchEnd: { period, matchTimeMs: periodDuration(match, period, context.now) },
    clockMode: match.clockMode,
    periodLengthMs: match.periodLengthMs,
    periodDurationsMs: match.periodDurationsMs,
  };
}

function periodDuration(match: Match, period: 1 | 2, now: number): number {
  const stored = match.periodDurationsMs?.[period - 1];
  if (stored != null) {
    return stored;
  }
  if (match.clock.period === period) {
    return displayedElapsedMs(match.clock, now);
  }
  return 0;
}
