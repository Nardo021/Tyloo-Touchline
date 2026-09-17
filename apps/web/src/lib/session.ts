import { getSetting, SETTING_KEYS, setSetting } from "../db/database";

export interface LocalSession {
  token: string;
  expiresAt: number;
}

export async function getLocalSession(): Promise<LocalSession | null> {
  const token = await getSetting<string | null>(SETTING_KEYS.sessionToken, null);
  const expiresAt = await getSetting<number | null>(SETTING_KEYS.sessionExpiresAt, null);
  if (!token || !expiresAt) {
    return null;
  }
  return { token, expiresAt };
}

export async function hasTrustedDevice(): Promise<boolean> {
  const session = await getLocalSession();
  return session !== null;
}

export async function storeLocalSession(token: string, expiresAt: number): Promise<void> {
  await setSetting(SETTING_KEYS.sessionToken, token);
  await setSetting(SETTING_KEYS.sessionExpiresAt, expiresAt);
}

export async function clearLocalSession(): Promise<void> {
  await setSetting(SETTING_KEYS.sessionToken, null);
  await setSetting(SETTING_KEYS.sessionExpiresAt, null);
}
