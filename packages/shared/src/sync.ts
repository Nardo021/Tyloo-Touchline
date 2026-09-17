import { z } from "zod";
import type { ClockTransitionKind } from "./clock.js";
import { CLOCK_PHASES } from "./clock.js";
import { EVENT_TYPES, EVENT_STATUSES } from "./events.js";
import { MATCH_STATUSES } from "./models.js";

export const MUTATION_KINDS = [
  "UPSERT_TEAM",
  "UPSERT_PLAYER",
  "UPSERT_MATCH",
  "UPSERT_MATCH_PLAYER",
  "UPSERT_EVENT",
  "VOID_EVENT",
  "CLOCK_TRANSITION",
  "UPSERT_SETTINGS",
  "DELETE_MATCH",
] as const;

export type MutationKind = (typeof MUTATION_KINDS)[number];

export const clockStateSchema = z.object({
  running: z.boolean(),
  accumulatedMs: z.number().int().nonnegative(),
  lastStartedAt: z.number().int().nullable(),
  period: z.number().int().positive(),
  phase: z.enum(CLOCK_PHASES),
});

export const teamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  logoDataUrl: z.string().max(400_000).nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const playerSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  number: z.number().int().min(0).max(99),
  name: z.string().trim().min(1).max(80),
  position: z.string().trim().max(32).nullable(),
  active: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const matchSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  opponent: z.string().trim().min(1).max(80),
  competition: z.string().trim().min(1).max(80),
  date: z.string().min(8).max(32),
  status: z.enum(MATCH_STATUSES),
  periodCount: z.number().int().min(1).max(8),
  periodLengthMs: z.number().int().min(60_000).max(3_600_000),
  currentPeriod: z.number().int().min(1).max(8),
  clock: clockStateSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  startedAt: z.number().int().nullable(),
  finishedAt: z.number().int().nullable(),
});

export const matchPlayerSchema = z.object({
  matchId: z.string().uuid(),
  playerId: z.string().uuid(),
  starter: z.boolean(),
  onField: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const baseEventFields = {
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  period: z.number().int().positive(),
  matchTimeMs: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deviceId: z.string().uuid(),
  status: z.enum(EVENT_STATUSES),
};

export const matchEventSchema = z.discriminatedUnion("type", [
  z.object({ ...baseEventFields, type: z.literal("GOAL"), playerId: z.string().uuid(), assistPlayerId: z.string().uuid().nullable() }),
  z.object({ ...baseEventFields, type: z.literal("ASSIST"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("SHOT"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("SHOT_ON_TARGET"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("KEY_DEFENCE"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("INTERCEPTION"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("FOUL"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("FOUL_WON"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("OFFSIDE"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("SAVE"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("YELLOW_CARD"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("RED_CARD"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("OWN_GOAL"), playerId: z.string().uuid() }),
  z.object({ ...baseEventFields, type: z.literal("CORNER_FOR"), playerId: z.null() }),
  z.object({ ...baseEventFields, type: z.literal("CORNER_AGAINST"), playerId: z.null() }),
  z.object({ ...baseEventFields, type: z.literal("GOAL_AGAINST"), playerId: z.null() }),
  z.object({
    ...baseEventFields,
    type: z.literal("SUBSTITUTION"),
    playerId: z.null(),
    playerOffId: z.string().uuid(),
    playerOnId: z.string().uuid(),
  }),
  z.object({
    ...baseEventFields,
    type: z.enum(["MATCH_START", "MATCH_PAUSE", "MATCH_RESUME", "PERIOD_END", "PERIOD_START", "MATCH_END"]),
    playerId: z.null(),
  }),
]);

export const settingsSchema = z.object({
  teamName: z.string().trim().min(1).max(80),
  logoDataUrl: z.string().max(400_000).nullable(),
  defaultPeriodCount: z.number().int().min(1).max(8),
  defaultPeriodLengthMs: z.number().int().min(60_000).max(3_600_000),
  deviceName: z.string().trim().min(1).max(80),
  firstUseHelpSeen: z.boolean(),
  updatedAt: z.number().int(),
});

export const clockTransitionSchema = z.object({
  matchId: z.string().uuid(),
  kind: z.enum(["START", "PAUSE", "RESUME", "END_PERIOD", "START_NEXT_PERIOD", "END_MATCH", "RESET"]),
  clock: clockStateSchema,
  at: z.number().int(),
});

export const mutationSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().uuid(), kind: z.literal("UPSERT_TEAM"), payload: teamSchema }),
  z.object({ id: z.string().uuid(), kind: z.literal("UPSERT_PLAYER"), payload: playerSchema }),
  z.object({ id: z.string().uuid(), kind: z.literal("UPSERT_MATCH"), payload: matchSchema }),
  z.object({ id: z.string().uuid(), kind: z.literal("UPSERT_MATCH_PLAYER"), payload: matchPlayerSchema }),
  z.object({ id: z.string().uuid(), kind: z.literal("UPSERT_EVENT"), payload: matchEventSchema }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("VOID_EVENT"),
    payload: z.object({ eventId: z.string().uuid(), updatedAt: z.number().int() }),
  }),
  z.object({ id: z.string().uuid(), kind: z.literal("CLOCK_TRANSITION"), payload: clockTransitionSchema }),
  z.object({ id: z.string().uuid(), kind: z.literal("UPSERT_SETTINGS"), payload: settingsSchema }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("DELETE_MATCH"),
    payload: z.object({ matchId: z.string().uuid(), updatedAt: z.number().int() }),
  }),
]);

export type Mutation = z.infer<typeof mutationSchema>;

export const syncRequestSchema = z.object({
  deviceId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80).optional(),
  lastServerCursor: z.number().int().nonnegative(),
  mutations: z.array(mutationSchema).max(200),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const remoteChangeSchema = z.object({
  cursor: z.number().int(),
  entity: z.enum(["team", "player", "match", "match_player", "event", "settings", "match_deleted"]),
  entityId: z.string(),
  payload: z.unknown(),
});

export type RemoteChange = z.infer<typeof remoteChangeSchema>;

export const syncResponseSchema = z.object({
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
  serverCursor: z.number().int(),
  remoteChanges: z.array(remoteChangeSchema),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;

export const authPinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  deviceId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80),
});

export const healthSchema = z.object({
  ok: z.literal(true),
});

export type { ClockTransitionKind };

export function isKnownEventType(value: string): value is (typeof EVENT_TYPES)[number] {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
