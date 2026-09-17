import { z } from "zod";
import { CLOCK_PHASES } from "./clock.js";
import { EVENT_STATUSES, EVENT_TYPES } from "./events.js";
import { MATCH_STATUSES } from "./models.js";

export const clockStateSchema = z.object({
  running: z.boolean(),
  accumulatedMs: z.number().int().nonnegative(),
  lastStartedAt: z.number().int().nullable(),
  period: z.number().int().positive(),
  phase: z.enum(CLOCK_PHASES),
});

export const clockStateRecordSchema = clockStateSchema.extend({
  matchId: z.string().uuid(),
  updatedAt: z.number().int(),
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
  keepAwake: z.boolean().optional(),
  updatedAt: z.number().int(),
});

export function isKnownEventType(value: string): value is (typeof EVENT_TYPES)[number] {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
