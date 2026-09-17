import { createId } from "@tyloo/shared";
import { getSetting, SETTING_KEYS, setSetting } from "../db/database";

export async function getDeviceId(): Promise<string> {
  const existing = await getSetting<string | null>(SETTING_KEYS.deviceId, null);
  if (existing) {
    return existing;
  }
  const id = createId();
  await setSetting(SETTING_KEYS.deviceId, id);
  return id;
}

export async function getDeviceName(): Promise<string> {
  return getSetting(SETTING_KEYS.deviceName, "Match iPad");
}

export async function setDeviceName(name: string): Promise<void> {
  await setSetting(SETTING_KEYS.deviceName, name);
}
