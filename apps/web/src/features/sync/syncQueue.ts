import { createId, type Mutation } from "@tyloo/shared";
import { db, type SyncQueueItem } from "../../db/database";

export async function enqueueMutation(mutation: Mutation): Promise<void> {
  const item: SyncQueueItem = {
    id: mutation.id || createId(),
    mutation,
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: Date.now(),
    lastError: null,
  };
  await db.syncQueue.put(item);
}

export async function pendingCount(): Promise<number> {
  return db.syncQueue.count();
}

export async function dueItems(now = Date.now()): Promise<SyncQueueItem[]> {
  return db.syncQueue.where("nextRetryAt").belowOrEqual(now).sortBy("createdAt");
}

export async function markAttempt(id: string, error: string | null, nextRetryAt: number): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (!item) {
    return;
  }
  await db.syncQueue.put({
    ...item,
    attempts: item.attempts + 1,
    lastError: error,
    nextRetryAt,
  });
}

export async function removeAccepted(ids: string[]): Promise<void> {
  await db.syncQueue.bulkDelete(ids);
}

export function backoffMs(attempts: number): number {
  const base = 5_000;
  return Math.min(60_000, base * 2 ** Math.max(0, attempts));
}
