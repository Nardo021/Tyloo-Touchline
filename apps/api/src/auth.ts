import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { createId } from "@tyloo/shared";
import type { Env } from "./env.js";

const COOKIE_NAME = "tyloo_session";

export { COOKIE_NAME };

export function hashToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

export function pinsEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function persistSession(
  db: Database.Database,
  env: Env,
  deviceId: string,
  deviceName: string,
  now = Date.now(),
): { token: string; expiresAt: number } {
  db.prepare(
    `INSERT INTO devices (id, name, last_seen_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen_at = excluded.last_seen_at`,
  ).run(deviceId, deviceName, now);

  const token = createSessionToken();
  const expiresAt = now + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  db.prepare(
    `INSERT INTO sessions (id, token_hash, device_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(createId(), hashToken(token, env.SESSION_SECRET), deviceId, now, expiresAt);
  return { token, expiresAt };
}

export function readSession(
  db: Database.Database,
  env: Env,
  token: string | undefined,
  now = Date.now(),
): { deviceId: string } | null {
  if (!token) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT device_id AS deviceId, expires_at AS expiresAt
       FROM sessions
       WHERE token_hash = ?`,
    )
    .get(hashToken(token, env.SESSION_SECRET)) as { deviceId: string; expiresAt: number } | undefined;
  if (!row || row.expiresAt < now) {
    return null;
  }
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(now, row.deviceId);
  return { deviceId: row.deviceId };
}

export function revokeSession(db: Database.Database, env: Env, token: string | undefined): void {
  if (!token) {
    return;
  }
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token, env.SESSION_SECRET));
}

export function cookieOptions(env: Env, expiresAt: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  };
}

export function checkPinRateLimit(
  db: Database.Database,
  env: Env,
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  const row = db
    .prepare("SELECT count, window_started_at AS windowStartedAt FROM pin_attempts WHERE key = ?")
    .get(key) as { count: number; windowStartedAt: number } | undefined;

  if (!row || now - row.windowStartedAt >= env.PIN_WINDOW_MS) {
    db.prepare(
      `INSERT INTO pin_attempts (key, count, window_started_at)
       VALUES (?, 0, ?)
       ON CONFLICT(key) DO UPDATE SET count = 0, window_started_at = excluded.window_started_at`,
    ).run(key, now);
    return { allowed: true, retryAfterMs: 0 };
  }

  if (row.count >= env.PIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: env.PIN_WINDOW_MS - (now - row.windowStartedAt) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function recordPinAttempt(db: Database.Database, key: string, success: boolean): void {
  if (success) {
    db.prepare("DELETE FROM pin_attempts WHERE key = ?").run(key);
    return;
  }
  db.prepare("UPDATE pin_attempts SET count = count + 1 WHERE key = ?").run(key);
}
