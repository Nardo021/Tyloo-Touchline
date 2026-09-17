import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { authPinSchema, DEFAULT_TEAM_ID, syncRequestSchema } from "@tyloo/shared";
import {
  checkPinRateLimit,
  COOKIE_NAME,
  cookieOptions,
  persistSession,
  pinsEqual,
  readSession,
  recordPinAttempt,
  revokeSession,
} from "./auth.js";
import type { Env } from "./env.js";
import { SyncEngine } from "./sync-engine.js";
import type Database from "better-sqlite3";

function requestToken(request: FastifyRequest): string | undefined {
  const cookieToken = request.cookies[COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return undefined;
}

export async function buildApp(env: Env, db: Database.Database): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_000_000,
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });

  const engine = new SyncEngine(db);

  app.get("/api/health", async () => ({ ok: true as const }));

  app.post(
    "/api/auth/pin",
    {
      config: {
        rateLimit: {
          max: env.PIN_MAX_ATTEMPTS,
          timeWindow: env.PIN_WINDOW_MS,
        },
      },
    },
    async (request, reply) => {
      const parsed = authPinSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Enter the 4 to 8 digit PIN." });
      }

      const ip = request.ip || "unknown";
      const limitKey = `${ip}:${parsed.data.deviceId}`;
      const limit = checkPinRateLimit(db, env, limitKey);
      if (!limit.allowed) {
        return reply.code(429).send({
          error: "Too many PIN attempts. Wait a few minutes and try again.",
          retryAfterMs: limit.retryAfterMs,
        });
      }

      const ok = pinsEqual(parsed.data.pin, env.APP_PIN);
      recordPinAttempt(db, limitKey, ok);
      if (!ok) {
        return reply.code(401).send({ error: "That PIN is not correct." });
      }

      const session = persistSession(db, env, parsed.data.deviceId, parsed.data.deviceName);
      reply.setCookie(COOKIE_NAME, session.token, cookieOptions(env, session.expiresAt));
      return {
        token: session.token,
        expiresAt: session.expiresAt,
        deviceId: parsed.data.deviceId,
      };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    revokeSession(db, env, requestToken(request));
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = readSession(db, env, requestToken(request));
    if (!session) {
      return reply.code(401).send({ error: "Not signed in." });
    }
    return { ok: true, deviceId: session.deviceId };
  });

  app.post("/api/sync", async (request, reply) => {
    const session = readSession(db, env, requestToken(request));
    if (!session) {
      return reply.code(401).send({ error: "Unlock this device to sync." });
    }
    const parsed = syncRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Sync payload was not valid." });
    }
    if (parsed.data.deviceId !== session.deviceId) {
      return reply.code(403).send({ error: "This session belongs to a different device." });
    }
    return engine.apply(parsed.data);
  });

  app.get("/api/bootstrap", async (request, reply) => {
    const session = readSession(db, env, requestToken(request));
    if (!session) {
      return reply.code(401).send({ error: "Unlock this device to sync." });
    }
    return engine.snapshot();
  });

  ensureDefaultTeam(db, env);
  return app;
}

function ensureDefaultTeam(db: Database.Database, env: Env): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO teams (id, name, logo_data_url, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = CASE WHEN teams.name = '' THEN excluded.name ELSE teams.name END`,
  ).run(DEFAULT_TEAM_ID, env.TEAM_NAME, now, now);
}
