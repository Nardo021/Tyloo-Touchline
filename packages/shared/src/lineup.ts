import { DEFAULT_PERIOD_LENGTH_MS, MATCH_BENCH_SIZE, MATCH_ON_FIELD_SIZE, MATCH_SQUAD_SIZE } from "./constants.js";
import { isActiveEvent, isLineupEvent, type MatchEvent } from "./events.js";
import type { ClockMode } from "./clock.js";
import type { MatchPlayer, MatchRuntimeState } from "./models.js";

export interface MatchInstant {
  period: number;
  matchTimeMs: number;
  createdAt?: number;
}

export interface RuntimeValidationInput {
  squadPlayerIds: string[];
  onFieldPlayerIds: string[];
  goalkeeperId: string | null;
}

export type RuntimeValidationResult =
  | { ok: true; benchPlayerIds: string[] }
  | { ok: false; errors: string[] };

export interface SubstitutionPair {
  playerOffId: string;
  playerOnId: string;
}

export interface LineupChangeSet {
  leaving: string[];
  entering: string[];
  pairs: SubstitutionPair[];
}

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function benchPlayerIds(squadPlayerIds: string[], onFieldPlayerIds: string[]): string[] {
  const onField = new Set(onFieldPlayerIds);
  return squadPlayerIds.filter((id) => !onField.has(id));
}

export function validateRuntimeState(input: RuntimeValidationInput): RuntimeValidationResult {
  const errors: string[] = [];
  const squad = uniqueIds(input.squadPlayerIds);
  if (squad.length !== input.squadPlayerIds.length) {
    errors.push("duplicate player IDs rejected");
  }
  if (squad.length !== MATCH_SQUAD_SIZE) {
    errors.push(`squad must have exactly ${MATCH_SQUAD_SIZE} unique players`);
  }

  const onField = uniqueIds(input.onFieldPlayerIds);
  if (onField.length !== input.onFieldPlayerIds.length) {
    errors.push("duplicate on-field player IDs rejected");
  }
  if (onField.length !== MATCH_ON_FIELD_SIZE) {
    errors.push(`on field must have exactly ${MATCH_ON_FIELD_SIZE} unique players`);
  }
  if (onField.some((id) => !squad.includes(id))) {
    errors.push("all on-field players must belong to the squad");
  }

  const bench = benchPlayerIds(squad, onField);
  if (squad.length === MATCH_SQUAD_SIZE && onField.length === MATCH_ON_FIELD_SIZE && bench.length !== MATCH_BENCH_SIZE) {
    errors.push(`bench must have exactly ${MATCH_BENCH_SIZE} players`);
  }

  if (!input.goalkeeperId) {
    errors.push("goalkeeper is required");
  } else if (!onField.includes(input.goalkeeperId)) {
    errors.push("goalkeeper must be one of the on-field players");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, benchPlayerIds: bench };
}

export function validateLiveRuntimeState(input: RuntimeValidationInput): RuntimeValidationResult {
  if (uniqueIds(input.squadPlayerIds).length === MATCH_SQUAD_SIZE) {
    return validateRuntimeState(input);
  }

  const errors: string[] = [];
  const squad = uniqueIds(input.squadPlayerIds);
  const onField = uniqueIds(input.onFieldPlayerIds);
  if (squad.length !== input.squadPlayerIds.length || onField.length !== input.onFieldPlayerIds.length) {
    errors.push("duplicate player IDs rejected");
  }
  if (onField.some((id) => !squad.includes(id))) {
    errors.push("all on-field players must belong to the squad");
  }
  if (!input.goalkeeperId) {
    errors.push("goalkeeper is required");
  } else if (!onField.includes(input.goalkeeperId)) {
    errors.push("goalkeeper must be one of the on-field players");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, benchPlayerIds: benchPlayerIds(squad, onField) };
}

export function createMatchRuntimeState(
  matchId: string,
  onFieldPlayerIds: string[],
  goalkeeperId: string,
  period: number,
  updatedAt: number,
  formationSnapshotId = "",
): MatchRuntimeState {
  return {
    matchId,
    onFieldPlayerIds: [...onFieldPlayerIds],
    goalkeeperId,
    period,
    formationSnapshotId,
    updatedAt,
  };
}

export function applySubstitutionToRuntime(
  state: MatchRuntimeState,
  playerOffId: string,
  playerOnId: string,
  updatedAt: number,
  nextGoalkeeperId?: string,
): MatchRuntimeState {
  if (playerOffId === playerOnId) {
    throw new Error("substitution off and on cannot be the same player");
  }
  if (!state.onFieldPlayerIds.includes(playerOffId)) {
    throw new Error("player off must currently be on the field");
  }
  if (state.onFieldPlayerIds.includes(playerOnId)) {
    throw new Error("player on must currently be on the bench");
  }

  const onFieldPlayerIds = state.onFieldPlayerIds.map((id) => (id === playerOffId ? playerOnId : id));
  let goalkeeperId = state.goalkeeperId;

  if (playerOffId === state.goalkeeperId) {
    if (!nextGoalkeeperId) {
      throw new Error("select a new goalkeeper before substituting the current goalkeeper off");
    }
    if (!onFieldPlayerIds.includes(nextGoalkeeperId)) {
      throw new Error("new goalkeeper must be on the field after the substitution");
    }
    goalkeeperId = nextGoalkeeperId;
  } else if (nextGoalkeeperId && nextGoalkeeperId !== state.goalkeeperId) {
    throw new Error("goalkeeper can only change during a substitution when the current goalkeeper goes off");
  }

  return {
    ...state,
    onFieldPlayerIds,
    goalkeeperId,
    updatedAt,
  };
}

export function applyGoalkeeperChangeToRuntime(
  state: MatchRuntimeState,
  newGoalkeeperId: string,
  updatedAt: number,
): MatchRuntimeState {
  if (newGoalkeeperId === state.goalkeeperId) {
    throw new Error("new goalkeeper must be a different on-field player");
  }
  if (!state.onFieldPlayerIds.includes(newGoalkeeperId)) {
    throw new Error("new goalkeeper must currently be on the field");
  }
  return {
    ...state,
    goalkeeperId: newGoalkeeperId,
    updatedAt,
  };
}

export function applyRuntimeToSquad(
  players: MatchPlayer[],
  onFieldPlayerIds: string[],
  updatedAt: number,
): MatchPlayer[] {
  const onField = new Set(onFieldPlayerIds);
  return players.map((player) => ({
    ...player,
    onField: onField.has(player.playerId),
    updatedAt,
  }));
}

export function deriveLineupChanges(previousOnFieldIds: string[], nextOnFieldIds: string[]): LineupChangeSet {
  const nextSet = new Set(nextOnFieldIds);
  const previousSet = new Set(previousOnFieldIds);
  const leaving = previousOnFieldIds.filter((id) => !nextSet.has(id));
  const entering = nextOnFieldIds.filter((id) => !previousSet.has(id));
  return {
    leaving,
    entering,
    pairs: pairHalftimeChanges(leaving, entering),
  };
}

export function pairHalftimeChanges(leaving: string[], entering: string[]): SubstitutionPair[] {
  const count = Math.min(leaving.length, entering.length);
  return Array.from({ length: count }, (_, index) => ({
    playerOffId: leaving[index] as string,
    playerOnId: entering[index] as string,
  }));
}

export function swapPairOnPlayer(pairs: SubstitutionPair[], pairIndex: number, newOnId: string): SubstitutionPair[] {
  const current = pairs[pairIndex];
  if (!current) {
    return pairs;
  }
  const displacedIndex = pairs.findIndex((pair) => pair.playerOnId === newOnId);
  return pairs.map((pair, index) => {
    if (index === pairIndex) {
      return { ...pair, playerOnId: newOnId };
    }
    if (index === displacedIndex) {
      return { ...pair, playerOnId: current.playerOnId };
    }
    return pair;
  });
}

export function validateHalftimePairs(
  previousOnFieldIds: string[],
  nextOnFieldIds: string[],
  pairs: SubstitutionPair[],
): boolean {
  const derived = deriveLineupChanges(previousOnFieldIds, nextOnFieldIds);
  if (pairs.length !== derived.leaving.length || pairs.length !== derived.entering.length) {
    return false;
  }
  const offIds = new Set(pairs.map((pair) => pair.playerOffId));
  const onIds = new Set(pairs.map((pair) => pair.playerOnId));
  return (
    derived.leaving.every((id) => offIds.has(id)) &&
    derived.entering.every((id) => onIds.has(id)) &&
    offIds.size === pairs.length &&
    onIds.size === pairs.length
  );
}

export function compareMatchInstants(a: MatchInstant, b: MatchInstant): number {
  if (a.period !== b.period) {
    return a.period - b.period;
  }
  if (a.matchTimeMs !== b.matchTimeMs) {
    return a.matchTimeMs - b.matchTimeMs;
  }
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

export function eventInstant(event: Pick<MatchEvent, "period" | "matchTimeMs" | "createdAt">): MatchInstant {
  return {
    period: event.period,
    matchTimeMs: event.matchTimeMs,
    createdAt: event.createdAt,
  };
}

export function isInstantAtOrBefore(event: MatchInstant, query: MatchInstant): boolean {
  return compareMatchInstants(event, query) <= 0;
}

export function sortEventsChronologically<T extends Pick<MatchEvent, "period" | "matchTimeMs" | "createdAt">>(
  events: T[],
): T[] {
  return [...events].sort((left, right) => compareMatchInstants(eventInstant(left), eventInstant(right)));
}

export function activeLineupEvents(events: MatchEvent[]): MatchEvent[] {
  return sortEventsChronologically(events.filter((event) => isActiveEvent(event) && isLineupEvent(event)));
}

export function getOnFieldPlayersAt(args: {
  starterIds: string[];
  events: MatchEvent[];
  query: MatchInstant;
}): string[] {
  const onField = new Set(args.starterIds);
  for (const event of activeLineupEvents(args.events)) {
    if (!isInstantAtOrBefore(eventInstant(event), args.query)) {
      break;
    }
    if (event.type === "SUBSTITUTION") {
      onField.delete(event.playerOffId);
      onField.add(event.playerOnId);
    }
  }
  return [...onField];
}

export function getGoalkeeperAt(args: {
  initialGoalkeeperId: string | null;
  events: MatchEvent[];
  query: MatchInstant;
}): string | null {
  let goalkeeperId = args.initialGoalkeeperId;
  for (const event of activeLineupEvents(args.events)) {
    if (!isInstantAtOrBefore(eventInstant(event), args.query)) {
      break;
    }
    if (event.type === "GOALKEEPER_CHANGE") {
      goalkeeperId = event.newGoalkeeperId;
    }
  }
  return goalkeeperId;
}

export function inferInitialGoalkeeper(events: MatchEvent[], fallback: string | null): string | null {
  const firstChange = activeLineupEvents(events).find((event) => event.type === "GOALKEEPER_CHANGE");
  if (firstChange?.type === "GOALKEEPER_CHANGE") {
    return firstChange.previousGoalkeeperId;
  }
  return fallback;
}

export function calculatePlayerTimePlayed(args: {
  playerId: string;
  starterIds: string[];
  events: MatchEvent[];
  matchEnd: MatchInstant;
  period?: number;
  clockMode: ClockMode;
  periodLengthMs?: number;
  periodDurationsMs?: number[];
}): number {
  const options = durationOptions(args);
  const startPeriod = args.period ?? 1;
  let onField = args.starterIds.includes(args.playerId);
  let intervalStart: MatchInstant | null = onField ? { period: startPeriod, matchTimeMs: 0, createdAt: 0 } : null;
  let total = 0;

  for (const event of activeLineupEvents(args.events)) {
    if (args.period != null && event.period !== args.period) {
      continue;
    }
    if (!isInstantAtOrBefore(eventInstant(event), args.matchEnd)) {
      break;
    }
    if (event.type !== "SUBSTITUTION") {
      continue;
    }
    if (event.playerOffId === args.playerId && onField) {
      if (intervalStart) {
        total += durationMs(intervalStart, eventInstant(event), options);
      }
      onField = false;
      intervalStart = null;
    } else if (event.playerOnId === args.playerId && !onField) {
      onField = true;
      intervalStart = eventInstant(event);
    }
  }

  if (onField && intervalStart) {
    total += durationMs(intervalStart, args.matchEnd, options);
  }
  return total;
}

export function calculateGoalkeeperTime(args: {
  playerId: string;
  initialGoalkeeperId: string | null;
  events: MatchEvent[];
  matchEnd: MatchInstant;
  period?: number;
  clockMode: ClockMode;
  periodLengthMs?: number;
  periodDurationsMs?: number[];
}): number {
  const options = durationOptions(args);
  const startPeriod = args.period ?? 1;
  let current = args.initialGoalkeeperId;
  let intervalStart: MatchInstant | null =
    current === args.playerId ? { period: startPeriod, matchTimeMs: 0, createdAt: 0 } : null;
  let total = 0;

  for (const event of activeLineupEvents(args.events)) {
    if (args.period != null && event.period !== args.period) {
      continue;
    }
    if (!isInstantAtOrBefore(eventInstant(event), args.matchEnd)) {
      break;
    }
    if (event.type !== "GOALKEEPER_CHANGE") {
      continue;
    }
    if (current === args.playerId && intervalStart) {
      total += durationMs(intervalStart, eventInstant(event), options);
      intervalStart = null;
    }
    current = event.newGoalkeeperId;
    if (current === args.playerId) {
      intervalStart = eventInstant(event);
    }
  }

  if (current === args.playerId && intervalStart) {
    total += durationMs(intervalStart, args.matchEnd, options);
  }
  return total;
}

export function goalsConcededByPlayer(args: {
  playerId: string;
  initialGoalkeeperId: string | null;
  events: MatchEvent[];
  period?: number;
}): number {
  let count = 0;
  for (const event of sortEventsChronologically(args.events.filter(isActiveEvent))) {
    if (args.period != null && event.period !== args.period) {
      continue;
    }
    if (event.type !== "GOAL_AGAINST") {
      continue;
    }
    const goalkeeperId = getGoalkeeperAt({
      initialGoalkeeperId: args.initialGoalkeeperId,
      events: args.events,
      query: eventInstant(event),
    });
    if (goalkeeperId === args.playerId) {
      count += 1;
    }
  }
  return count;
}

export interface DurationOptions {
  periodLengthMs?: number;
  clockMode: ClockMode;
  periodDurationsMs?: number[];
}

export function periodLocalMatchTimeMs(
  instant: MatchInstant,
  periodLengthMs = DEFAULT_PERIOD_LENGTH_MS,
  clockMode: ClockMode,
): number {
  if (clockMode === "cumulative" && instant.period > 1) {
    return Math.max(0, instant.matchTimeMs - (instant.period - 1) * periodLengthMs);
  }
  return instant.matchTimeMs;
}

export function absoluteMatchMs(
  instant: MatchInstant,
  periodLengthMs = DEFAULT_PERIOD_LENGTH_MS,
  clockMode: ClockMode,
  periodDurationsMs?: number[],
): number {
  if (clockMode === "cumulative") {
    return instant.matchTimeMs;
  }
  let total = instant.matchTimeMs;
  for (let period = 1; period < instant.period; period += 1) {
    total += periodDurationsMs?.[period - 1] ?? periodLengthMs;
  }
  return total;
}

export function durationMs(start: MatchInstant, end: MatchInstant, options: DurationOptions): number {
  const periodLengthMs = options.periodLengthMs ?? DEFAULT_PERIOD_LENGTH_MS;
  return Math.max(
    0,
    absoluteMatchMs(end, periodLengthMs, options.clockMode, options.periodDurationsMs) -
      absoluteMatchMs(start, periodLengthMs, options.clockMode, options.periodDurationsMs),
  );
}

export function lineupAtPeriodStart(args: {
  starterIds: string[];
  events: MatchEvent[];
  period: number;
}): string[] {
  if (args.period <= 1) {
    return [...args.starterIds];
  }
  return getOnFieldPlayersAt({
    starterIds: args.starterIds,
    events: args.events,
    query: { period: args.period, matchTimeMs: 0, createdAt: Number.MAX_SAFE_INTEGER },
  });
}

export function goalkeeperAtPeriodStart(args: {
  initialGoalkeeperId: string | null;
  events: MatchEvent[];
  period: number;
}): string | null {
  if (args.period <= 1) {
    return args.initialGoalkeeperId;
  }
  return getGoalkeeperAt({
    initialGoalkeeperId: args.initialGoalkeeperId,
    events: args.events,
    query: { period: args.period, matchTimeMs: 0, createdAt: Number.MAX_SAFE_INTEGER },
  });
}

function durationOptions(args: DurationOptions): DurationOptions {
  return {
    periodLengthMs: args.periodLengthMs,
    clockMode: args.clockMode,
    periodDurationsMs: args.periodDurationsMs,
  };
}

export function runtimeFromMatchPlayers(
  matchId: string,
  players: MatchPlayer[],
  period: number,
  updatedAt: number,
  goalkeeperId = "",
  formationSnapshotId = "",
): MatchRuntimeState {
  return {
    matchId,
    onFieldPlayerIds: players.filter((player) => player.onField).map((player) => player.playerId),
    goalkeeperId,
    period,
    formationSnapshotId,
    updatedAt,
  };
}

export function latestLineupGroup(events: MatchEvent[]): MatchEvent[] {
  const active = activeLineupEvents(events);
  const latest = active[active.length - 1];
  if (!latest) {
    return [];
  }
  return active.filter(
    (event) => event.createdAt === latest.createdAt && event.period === latest.period && event.matchTimeMs === latest.matchTimeMs,
  );
}

export function isLatestLineupEvent(events: MatchEvent[], eventId: string): boolean {
  return latestLineupGroup(events).some((event) => event.id === eventId);
}
