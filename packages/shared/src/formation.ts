import { MATCH_ON_FIELD_SIZE } from "./constants.js";

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export const FORMATION_TYPES = ["2-1-2", "2-2-1", "CUSTOM"] as const;
export type FormationType = (typeof FORMATION_TYPES)[number];

export const TACTICAL_ROLES = ["GK", "DEF", "MID", "FWD"] as const;
export type TacticalRole = (typeof TACTICAL_ROLES)[number];

export const CLOCK_MODES = ["period-local", "cumulative"] as const;
export type ClockMode = (typeof CLOCK_MODES)[number];

export interface SlotDefinition {
  slotId: string;
  role: TacticalRole;
  order: number;
  label: string;
}

export interface LineupSlot {
  slotId: string;
  role: TacticalRole;
  playerId: string;
  order: number;
}

export interface FormationSnapshot {
  id: string;
  matchId: string;
  period: number;
  formation: FormationType;
  effectiveMatchTimeMs: number;
  slots: LineupSlot[];
  createdAt: number;
}

export interface FormationPresetSlot {
  slotId: string;
  role: TacticalRole;
  order: number;
  playerId: string | null;
  playerNumber: number | null;
}

export interface FormationPreset {
  id: string;
  half: 1 | 2;
  name: string;
  formation: FormationType;
  slots: FormationPresetSlot[];
  updatedAt: number;
}

export interface LineupDraft {
  matchId: string;
  purpose: "PRE_MATCH" | "HALF_TIME";
  formation: FormationType;
  slots: LineupSlot[];
  onFieldPlayerIds: string[];
  goalkeeperId: string;
  updatedAt: number;
}

export const FORMATION_212_SLOTS: SlotDefinition[] = [
  { slotId: "FWD_LEFT", role: "FWD", order: 0, label: "Forward" },
  { slotId: "FWD_RIGHT", role: "FWD", order: 1, label: "Forward" },
  { slotId: "MID_CENTER", role: "MID", order: 2, label: "Midfield" },
  { slotId: "DEF_LEFT", role: "DEF", order: 3, label: "Defence" },
  { slotId: "DEF_RIGHT", role: "DEF", order: 4, label: "Defence" },
  { slotId: "GK", role: "GK", order: 5, label: "Goalkeeper" },
];

export const FORMATION_221_SLOTS: SlotDefinition[] = [
  { slotId: "FWD_CENTER", role: "FWD", order: 0, label: "Forward" },
  { slotId: "MID_LEFT", role: "MID", order: 1, label: "Midfield" },
  { slotId: "MID_RIGHT", role: "MID", order: 2, label: "Midfield" },
  { slotId: "DEF_LEFT", role: "DEF", order: 3, label: "Defence" },
  { slotId: "DEF_RIGHT", role: "DEF", order: 4, label: "Defence" },
  { slotId: "GK", role: "GK", order: 5, label: "Goalkeeper" },
];

export const FORMATION_CUSTOM_SLOTS: SlotDefinition[] = FORMATION_212_SLOTS;

export const DEFAULT_FIRST_HALF_PRESET_BY_NUMBER: ReadonlyArray<{
  slotId: string;
  role: TacticalRole;
  number: number;
}> = [
  { slotId: "FWD_LEFT", role: "FWD", number: 11 },
  { slotId: "FWD_RIGHT", role: "FWD", number: 7 },
  { slotId: "MID_CENTER", role: "MID", number: 10 },
  { slotId: "DEF_LEFT", role: "DEF", number: 5 },
  { slotId: "DEF_RIGHT", role: "DEF", number: 18 },
  { slotId: "GK", role: "GK", number: 6 },
];

export const DEFAULT_SECOND_HALF_PRESET_BY_NUMBER: ReadonlyArray<{
  slotId: string;
  role: TacticalRole;
  number: number | null;
}> = [
  { slotId: "FWD_CENTER", role: "FWD", number: null },
  { slotId: "MID_LEFT", role: "MID", number: 6 },
  { slotId: "MID_RIGHT", role: "MID", number: 10 },
  { slotId: "DEF_LEFT", role: "DEF", number: 5 },
  { slotId: "DEF_RIGHT", role: "DEF", number: 18 },
  { slotId: "GK", role: "GK", number: 7 },
];

export const DEFAULT_FIRST_HALF_PRESET_ID = "00000000-0000-4000-8000-00000000aa01";
export const DEFAULT_SECOND_HALF_PRESET_ID = "00000000-0000-4000-8000-00000000aa02";

export const PREFERRED_ROLES_BY_NUMBER: Record<number, readonly TacticalRole[]> = {
  11: ["FWD", "GK"],
  7: ["FWD", "GK"],
  8: ["FWD"],
  10: ["MID"],
  5: ["DEF"],
  18: ["DEF"],
  9: ["DEF"],
  6: ["GK", "MID"],
};

export function slotsForFormation(formation: FormationType): SlotDefinition[] {
  switch (formation) {
    case "2-1-2":
      return FORMATION_212_SLOTS;
    case "2-2-1":
      return FORMATION_221_SLOTS;
    case "CUSTOM":
      return FORMATION_CUSTOM_SLOTS;
    default: {
      const _exhaustive: never = formation;
      return _exhaustive;
    }
  }
}

export function emptySlots(formation: FormationType): LineupSlot[] {
  return slotsForFormation(formation).map((slot) => ({
    slotId: slot.slotId,
    role: slot.role,
    playerId: "",
    order: slot.order,
  }));
}

export function goalkeeperIdFromSlots(slots: LineupSlot[]): string {
  return slots.find((slot) => slot.role === "GK")?.playerId ?? "";
}

export function onFieldIdsFromSlots(slots: LineupSlot[]): string[] {
  return slots.map((slot) => slot.playerId).filter(Boolean);
}

export type FormationValidationResult =
  | { ok: true; goalkeeperId: string; onFieldPlayerIds: string[] }
  | { ok: false; errors: string[] };

export function validateLineupSlots(
  formation: FormationType,
  slots: LineupSlot[],
  onFieldPlayerIds: string[],
  goalkeeperId?: string | null,
): FormationValidationResult {
  const errors: string[] = [];
  const expected = slotsForFormation(formation);
  if (slots.length !== MATCH_ON_FIELD_SIZE || expected.length !== MATCH_ON_FIELD_SIZE) {
    errors.push("formation must contain exactly six slots");
  }

  const expectedIds = new Set(expected.map((slot) => slot.slotId));
  const slotIds = slots.map((slot) => slot.slotId);
  if (uniqueIds(slotIds).length !== slotIds.length) {
    errors.push("duplicate formation slots rejected");
  }
  for (const slot of expected) {
    if (!slotIds.includes(slot.slotId)) {
      errors.push(`missing ${slot.slotId} slot`);
    }
  }
  for (const slot of slots) {
    if (!expectedIds.has(slot.slotId)) {
      errors.push(`unexpected ${slot.slotId} slot`);
    }
    const definition = expected.find((item) => item.slotId === slot.slotId);
    if (definition && definition.role !== slot.role && formation !== "CUSTOM") {
      errors.push(`${slot.slotId} must be ${definition.role}`);
    }
  }

  const assigned = slots.map((slot) => slot.playerId);
  if (assigned.some((id) => !id)) {
    errors.push("every tactical slot needs a player");
  }
  if (uniqueIds(assigned.filter(Boolean)).length !== assigned.filter(Boolean).length) {
    errors.push("each on-field player can occupy only one slot");
  }

  const field = uniqueIds(onFieldPlayerIds);
  if (field.length !== MATCH_ON_FIELD_SIZE) {
    errors.push("select exactly six on-field players");
  }
  for (const playerId of assigned.filter(Boolean)) {
    if (!field.includes(playerId)) {
      errors.push("every slotted player must be one of the six on the field");
      break;
    }
  }
  for (const playerId of field) {
    if (!assigned.includes(playerId)) {
      errors.push("every on-field player must appear in the formation");
      break;
    }
  }

  const gkSlots = slots.filter((slot) => slot.role === "GK");
  if (gkSlots.length !== 1) {
    errors.push("exactly one goalkeeper slot is required");
  }
  const gkId = gkSlots[0]?.playerId ?? "";
  if (gkId && !field.includes(gkId)) {
    errors.push("goalkeeper must belong to the selected six");
  }
  if (goalkeeperId && gkId && goalkeeperId !== gkId) {
    errors.push("goalkeeper must occupy the GK slot");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, goalkeeperId: gkId, onFieldPlayerIds: field };
}

export function assignSlotPlayer(slots: LineupSlot[], slotId: string, playerId: string): LineupSlot[] {
  const current = slots.find((slot) => slot.slotId === slotId);
  if (!current) {
    return slots;
  }
  const displaced = slots.find((slot) => slot.playerId === playerId && slot.slotId !== slotId);
  return slots.map((slot) => {
    if (slot.slotId === slotId) {
      return { ...slot, playerId };
    }
    if (displaced && slot.slotId === displaced.slotId) {
      return { ...slot, playerId: current.playerId };
    }
    return slot;
  });
}

export function inheritSlotOnSubstitution(
  slots: LineupSlot[],
  playerOffId: string,
  playerOnId: string,
): LineupSlot[] {
  return slots.map((slot) => (slot.playerId === playerOffId ? { ...slot, playerId: playerOnId } : slot));
}

export function applyGoalkeeperToSlots(slots: LineupSlot[], newGoalkeeperId: string): LineupSlot[] {
  const gkSlot = slots.find((slot) => slot.role === "GK");
  const previousSlot = slots.find((slot) => slot.playerId === newGoalkeeperId);
  if (!gkSlot || !previousSlot || gkSlot.playerId === newGoalkeeperId) {
    return slots;
  }
  return slots.map((slot) => {
    if (slot.slotId === gkSlot.slotId) {
      return { ...slot, playerId: newGoalkeeperId };
    }
    if (slot.slotId === previousSlot.slotId) {
      return { ...slot, playerId: gkSlot.playerId };
    }
    return slot;
  });
}

export function remapSlotsToFormation(
  current: LineupSlot[],
  nextFormation: FormationType,
  onFieldPlayerIds: string[],
  goalkeeperId: string,
): LineupSlot[] {
  const nextDefs = slotsForFormation(nextFormation);
  const used = new Set<string>();
  const next: LineupSlot[] = nextDefs.map((definition) => ({
    slotId: definition.slotId,
    role: definition.role,
    playerId: "",
    order: definition.order,
  }));

  const gkSlot = next.find((slot) => slot.role === "GK");
  if (gkSlot && onFieldPlayerIds.includes(goalkeeperId)) {
    gkSlot.playerId = goalkeeperId;
    used.add(goalkeeperId);
  }

  for (const slot of next) {
    if (slot.playerId) {
      continue;
    }
    const candidate = current.find((item) => (
      item.role === slot.role
      && item.playerId
      && !used.has(item.playerId)
      && onFieldPlayerIds.includes(item.playerId)
    ));
    if (candidate) {
      slot.playerId = candidate.playerId;
      used.add(candidate.playerId);
    }
  }

  const remaining = onFieldPlayerIds.filter((id) => !used.has(id));
  for (const slot of next) {
    if (!slot.playerId) {
      const nextPlayer = remaining.shift();
      if (nextPlayer) {
        slot.playerId = nextPlayer;
        used.add(nextPlayer);
      }
    }
  }

  return next;
}

export function slotsFromPreset(
  formation: FormationType,
  presetSlots: ReadonlyArray<{ slotId: string; role: TacticalRole; number?: number | null }>,
  players: ReadonlyArray<{ id: string; number: number }>,
): LineupSlot[] {
  const byNumber = new Map(players.map((player) => [player.number, player.id]));
  return slotsForFormation(formation).map((definition) => {
    const preset = presetSlots.find((slot) => slot.slotId === definition.slotId);
    const number = preset?.number ?? null;
    return {
      slotId: definition.slotId,
      role: definition.role,
      playerId: number == null ? "" : (byNumber.get(number) ?? ""),
      order: definition.order,
    };
  });
}

export function applyDefaultFirstHalfPreset(players: ReadonlyArray<{ id: string; number: number }>): {
  formation: FormationType;
  slots: LineupSlot[];
  onFieldPlayerIds: string[];
  goalkeeperId: string;
} {
  const slots = slotsFromPreset("2-1-2", DEFAULT_FIRST_HALF_PRESET_BY_NUMBER, players);
  return {
    formation: "2-1-2",
    slots,
    onFieldPlayerIds: onFieldIdsFromSlots(slots),
    goalkeeperId: goalkeeperIdFromSlots(slots),
  };
}

export function applyDefaultSecondHalfPreset(players: ReadonlyArray<{ id: string; number: number }>): {
  formation: FormationType;
  slots: LineupSlot[];
  onFieldPlayerIds: string[];
  goalkeeperId: string;
} {
  const slots = slotsFromPreset("2-2-1", DEFAULT_SECOND_HALF_PRESET_BY_NUMBER, players);
  return {
    formation: "2-2-1",
    slots,
    onFieldPlayerIds: onFieldIdsFromSlots(slots),
    goalkeeperId: goalkeeperIdFromSlots(slots),
  };
}

export function preferredRolesForNumber(number: number): TacticalRole[] {
  return [...(PREFERRED_ROLES_BY_NUMBER[number] ?? [])];
}

export function slotsByRole(slots: LineupSlot[]): Record<TacticalRole, LineupSlot[]> {
  const grouped: Record<TacticalRole, LineupSlot[]> = {
    FWD: [],
    MID: [],
    DEF: [],
    GK: [],
  };
  for (const slot of [...slots].sort((left, right) => left.order - right.order)) {
    grouped[slot.role].push(slot);
  }
  return grouped;
}

export function createFormationSnapshot(input: {
  id: string;
  matchId: string;
  period: number;
  formation: FormationType;
  effectiveMatchTimeMs: number;
  slots: LineupSlot[];
  createdAt: number;
}): FormationSnapshot {
  return {
    id: input.id,
    matchId: input.matchId,
    period: input.period,
    formation: input.formation,
    effectiveMatchTimeMs: input.effectiveMatchTimeMs,
    slots: input.slots.map((slot) => ({ ...slot })),
    createdAt: input.createdAt,
  };
}

export function sortFormationSnapshots(snapshots: FormationSnapshot[]): FormationSnapshot[] {
  return [...snapshots].sort((left, right) => {
    if (left.period !== right.period) {
      return left.period - right.period;
    }
    if (left.effectiveMatchTimeMs !== right.effectiveMatchTimeMs) {
      return left.effectiveMatchTimeMs - right.effectiveMatchTimeMs;
    }
    return left.createdAt - right.createdAt;
  });
}

export function snapshotAt(snapshots: FormationSnapshot[], period: number, matchTimeMs: number): FormationSnapshot | null {
  const sorted = sortFormationSnapshots(snapshots);
  let current: FormationSnapshot | null = null;
  for (const snapshot of sorted) {
    if (snapshot.period < period || (snapshot.period === period && snapshot.effectiveMatchTimeMs <= matchTimeMs)) {
      current = snapshot;
      continue;
    }
    break;
  }
  return current;
}

export function startingSnapshotForPeriod(snapshots: FormationSnapshot[], period: number): FormationSnapshot | null {
  return sortFormationSnapshots(snapshots).find((snapshot) => snapshot.period === period) ?? null;
}

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

export interface LineupChangeReview {
  formationChanged: boolean;
  previousFormation: FormationType | null;
  newFormation: FormationType;
  goalkeeperChanged: boolean;
  previousGoalkeeperId: string;
  newGoalkeeperId: string;
  roleChanges: Array<{ playerId: string; previousRole: TacticalRole | null; newRole: TacticalRole }>;
}

export function reviewLineupChange(
  previous: { formation: FormationType; slots: LineupSlot[] } | null,
  next: { formation: FormationType; slots: LineupSlot[] },
): LineupChangeReview {
  const previousByPlayer = new Map((previous?.slots ?? []).map((slot) => [slot.playerId, slot.role]));
  const roleChanges: LineupChangeReview["roleChanges"] = [];
  for (const slot of next.slots) {
    const previousRole = previousByPlayer.get(slot.playerId) ?? null;
    if (previousRole !== slot.role) {
      roleChanges.push({ playerId: slot.playerId, previousRole, newRole: slot.role });
    }
  }
  return {
    formationChanged: previous != null && previous.formation !== next.formation,
    previousFormation: previous?.formation ?? null,
    newFormation: next.formation,
    goalkeeperChanged: goalkeeperIdFromSlots(previous?.slots ?? []) !== goalkeeperIdFromSlots(next.slots),
    previousGoalkeeperId: goalkeeperIdFromSlots(previous?.slots ?? []),
    newGoalkeeperId: goalkeeperIdFromSlots(next.slots),
    roleChanges,
  };
}

export function isCompletePreset(preset: FormationPreset): boolean {
  return preset.slots.length === MATCH_ON_FIELD_SIZE && preset.slots.every((slot) => Boolean(slot.playerId || slot.playerNumber));
}

export function isUsableHalftimeDraft(draft: LineupDraft | null | undefined): boolean {
  return Boolean(
    draft
    && draft.purpose === "HALF_TIME"
    && uniqueIds(draft.onFieldPlayerIds.filter(Boolean)).length === MATCH_ON_FIELD_SIZE,
  );
}

export function resolveHalftimeInitialLineup(input: {
  draft?: LineupDraft | null;
  previousOnField: string[];
  previousSlots: LineupSlot[];
  previousGk: string;
  presetFormation: FormationType;
  presetSlots: LineupSlot[];
}): {
  onFieldIds: string[];
  formation: FormationType;
  slots: LineupSlot[];
  source: "draft" | "preset" | "first-half";
} {
  if (input.draft && isUsableHalftimeDraft(input.draft)) {
    return {
      onFieldIds: uniqueIds(input.draft.onFieldPlayerIds.filter(Boolean)),
      formation: input.draft.formation,
      slots: input.draft.slots,
      source: "draft",
    };
  }

  const presetAssigned = uniqueIds(input.presetSlots.map((slot) => slot.playerId).filter(Boolean));
  if (presetAssigned.length === MATCH_ON_FIELD_SIZE) {
    return {
      onFieldIds: presetAssigned,
      formation: input.presetFormation,
      slots: input.presetSlots,
      source: "preset",
    };
  }

  const previous = uniqueIds(input.previousOnField.filter(Boolean));
  const presetGk = goalkeeperIdFromSlots(input.presetSlots);
  const gk = previous.includes(presetGk)
    ? presetGk
    : previous.includes(input.previousGk)
      ? input.previousGk
      : (previous[0] ?? "");
  let slots = remapSlotsToFormation(input.previousSlots, input.presetFormation, previous, gk);
  for (const presetSlot of input.presetSlots) {
    if (presetSlot.playerId && previous.includes(presetSlot.playerId)) {
      slots = assignSlotPlayer(slots, presetSlot.slotId, presetSlot.playerId);
    }
  }
  return {
    onFieldIds: previous,
    formation: input.presetFormation,
    slots,
    source: "first-half",
  };
}

export function defaultFirstHalfPreset(updatedAt: number): FormationPreset {
  return {
    id: DEFAULT_FIRST_HALF_PRESET_ID,
    half: 1,
    name: "First half",
    formation: "2-1-2",
    slots: DEFAULT_FIRST_HALF_PRESET_BY_NUMBER.map((slot, index) => ({
      slotId: slot.slotId,
      role: slot.role,
      order: index,
      playerId: null,
      playerNumber: slot.number,
    })),
    updatedAt,
  };
}

export function defaultSecondHalfPreset(updatedAt: number): FormationPreset {
  return {
    id: DEFAULT_SECOND_HALF_PRESET_ID,
    half: 2,
    name: "Second half",
    formation: "2-2-1",
    slots: DEFAULT_SECOND_HALF_PRESET_BY_NUMBER.map((slot, index) => ({
      slotId: slot.slotId,
      role: slot.role,
      order: index,
      playerId: null,
      playerNumber: slot.number,
    })),
    updatedAt,
  };
}
