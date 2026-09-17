type UpdateListener = (available: boolean) => void;

const listeners = new Set<UpdateListener>();
let updateAvailable = false;
let applyFn: (() => Promise<void>) | null = null;

function emit(): void {
  for (const listener of listeners) {
    listener(updateAvailable);
  }
}

export function subscribeUpdateAvailability(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export function isUpdateAvailable(): boolean {
  return updateAvailable;
}

export function notifyUpdateAvailable(apply: () => Promise<void>): void {
  applyFn = apply;
  updateAvailable = true;
  emit();
}

export async function applyPendingUpdate(): Promise<void> {
  if (!applyFn) {
    return;
  }
  await applyFn();
}

export function shouldPromptForUpdate(hasActiveMatch: boolean): boolean {
  return updateAvailable && !hasActiveMatch;
}
