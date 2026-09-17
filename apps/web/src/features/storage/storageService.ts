import { db, METADATA_KEYS, setMetadata } from "../../db/database";
import { createId } from "@tyloo/shared";

export type PersistentStorageState = "granted" | "denied" | "unsupported" | "unknown";

export interface StorageEstimateInfo {
  usage: number | null;
  quota: number | null;
}

export class StorageService {
  async persist(): Promise<PersistentStorageState> {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
      await setMetadata(METADATA_KEYS.persistentStorage, "unsupported");
      return "unsupported";
    }
    try {
      const granted = await navigator.storage.persist();
      const state: PersistentStorageState = granted ? "granted" : "denied";
      await setMetadata(METADATA_KEYS.persistentStorage, state);
      return state;
    } catch {
      await setMetadata(METADATA_KEYS.persistentStorage, "unknown");
      return "unknown";
    }
  }

  async estimate(): Promise<StorageEstimateInfo> {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return { usage: null, quota: null };
    }
    try {
      const result = await navigator.storage.estimate();
      return {
        usage: typeof result.usage === "number" ? result.usage : null,
        quota: typeof result.quota === "number" ? result.quota : null,
      };
    } catch {
      return { usage: null, quota: null };
    }
  }

  async probeWritable(): Promise<boolean> {
    const key = `probe:${createId()}`;
    try {
      await db.open();
      await db.appMetadata.put({ key, value: Date.now() });
      await db.appMetadata.delete(key);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();
