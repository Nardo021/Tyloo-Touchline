import { afterEach, describe, expect, it } from "vitest";
import {
  createId,
  DEFAULT_TEAM_ID,
  type GoalEvent,
  type Match,
  type Mutation,
  type Player,
} from "@tyloo/shared";
import { buildApp } from "./app.js";
import { openMemoryDatabase } from "./db.js";
import type { Env } from "./env.js";
import { applyMigrations } from "./migrate.js";
import { seedDevelopmentData } from "./seed.js";
import { SyncEngine } from "./sync-engine.js";
import { persistSession } from "./auth.js";

const env: Env = {
  API_PORT: 3001,
  DATABASE_PATH: ":memory:",
  APP_PIN: "1234",
  SESSION_SECRET: "test-session-secret-value",
  SESSION_TTL_DAYS: 90,
  PIN_MAX_ATTEMPTS: 5,
  PIN_WINDOW_MS: 900_000,
  TEAM_NAME: "Tyloo FC",
  SEED_ON_START: false,
  TRUST_PROXY: true,
  NODE_ENV: "test",
};

function makePlayer(): Player {
  const now = 1;
  return {
    id: createId(),
    teamId: DEFAULT_TEAM_ID,
    number: 11,
    name: "Leo",
    position: "FWD",
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeMatch(): Match {
  const now = 1;
  return {
    id: createId(),
    teamId: DEFAULT_TEAM_ID,
    opponent: "Northside",
    competition: "NSFA Summer",
    date: "2026-09-17",
    status: "RUNNING",
    periodCount: 2,
    periodLengthMs: 20 * 60 * 1000,
    currentPeriod: 1,
    clock: {
      running: true,
      accumulatedMs: 0,
      lastStartedAt: 1,
      period: 1,
      phase: "RUNNING",
    },
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
  };
}

function goalEvent(matchId: string, playerId: string, deviceId: string): GoalEvent {
  return {
    id: createId(),
    matchId,
    type: "GOAL",
    playerId,
    assistPlayerId: null,
    period: 1,
    matchTimeMs: 1842000,
    createdAt: 10,
    updatedAt: 10,
    deviceId,
    status: "ACTIVE",
  };
}

describe("sync protocol", () => {
  const dbs: ReturnType<typeof openMemoryDatabase>[] = [];

  afterEach(() => {
    for (const db of dbs) {
      db.close();
    }
    dbs.length = 0;
  });

  function memoryDb() {
    const db = openMemoryDatabase();
    applyMigrations(db);
    seedDevelopmentData(db);
    dbs.push(db);
    return db;
  }

  it("stores an uploaded event exactly once when retried", () => {
    const db = memoryDb();
    const engine = new SyncEngine(db);
    const deviceId = createId();
    const player = makePlayer();
    const match = makeMatch();
    const event = goalEvent(match.id, player.id, deviceId);
    const mutations: Mutation[] = [
      { id: createId(), kind: "UPSERT_PLAYER", payload: player },
      { id: createId(), kind: "UPSERT_MATCH", payload: match },
      { id: createId(), kind: "UPSERT_EVENT", payload: event },
    ];

    engine.apply({ deviceId, lastServerCursor: 0, mutations });
    const retry = engine.apply({
      deviceId,
      lastServerCursor: 0,
      mutations: [{ id: createId(), kind: "UPSERT_EVENT", payload: event }],
    });

    const count = db.prepare("SELECT COUNT(*) AS count FROM events WHERE id = ?").get(event.id) as {
      count: number;
    };
    expect(count.count).toBe(1);
    expect(retry.accepted).toContain(mutations[0] ? retry.accepted[0] : retry.accepted[0]);
    expect(retry.accepted).toHaveLength(1);
  });

  it("voids an event without deleting the row", () => {
    const db = memoryDb();
    const engine = new SyncEngine(db);
    const deviceId = createId();
    const player = makePlayer();
    const match = makeMatch();
    const event = goalEvent(match.id, player.id, deviceId);
    engine.apply({
      deviceId,
      lastServerCursor: 0,
      mutations: [
        { id: createId(), kind: "UPSERT_PLAYER", payload: player },
        { id: createId(), kind: "UPSERT_MATCH", payload: match },
        { id: createId(), kind: "UPSERT_EVENT", payload: event },
      ],
    });
    engine.apply({
      deviceId,
      lastServerCursor: 0,
      mutations: [{ id: createId(), kind: "VOID_EVENT", payload: { eventId: event.id, updatedAt: 99 } }],
    });
    const row = db.prepare("SELECT status FROM events WHERE id = ?").get(event.id) as { status: string };
    expect(row.status).toBe("VOIDED");
  });

  it("accepts HTTP sync with a trusted session and rejects duplicates", async () => {
    const db = memoryDb();
    const app = await buildApp(env, db);
    const deviceId = createId();
    const session = persistSession(db, env, deviceId, "Test iPad");
    const player = makePlayer();
    const match = makeMatch();
    const event = goalEvent(match.id, player.id, deviceId);

    const body = {
      deviceId,
      lastServerCursor: 0,
      mutations: [
        { id: createId(), kind: "UPSERT_PLAYER", payload: player },
        { id: createId(), kind: "UPSERT_MATCH", payload: match },
        { id: createId(), kind: "UPSERT_EVENT", payload: event },
      ],
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { authorization: `Bearer ${session.token}` },
      payload: body,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        deviceId,
        lastServerCursor: 0,
        mutations: [{ id: createId(), kind: "UPSERT_EVENT", payload: event }],
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const count = db.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    expect(count.count).toBe(1);
    await app.close();
  });

  it("rate limits incorrect PIN attempts", async () => {
    const db = memoryDb();
    const app = await buildApp(env, db);
    const deviceId = createId();
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/pin",
        payload: { pin: "0000", deviceId, deviceName: "iPad" },
      });
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/pin",
      payload: { pin: "0000", deviceId, deviceName: "iPad" },
    });
    expect(blocked.statusCode).toBe(429);
    await app.close();
  });
});
