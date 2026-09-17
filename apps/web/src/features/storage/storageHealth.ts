type HealthListener = (healthy: boolean, message: string | null) => void;

const listeners = new Set<HealthListener>();
let healthy = true;
let message: string | null = null;

function emit(): void {
  for (const listener of listeners) {
    listener(healthy, message);
  }
}

export function subscribeStorageHealth(listener: HealthListener): () => void {
  listeners.add(listener);
  listener(healthy, message);
  return () => {
    listeners.delete(listener);
  };
}

export function markStorageHealthy(): void {
  healthy = true;
  message = null;
  emit();
}

export function markStorageUnavailable(reason = "This iPad cannot write match data right now."): void {
  healthy = false;
  message = reason;
  emit();
}

export function isStorageHealthy(): boolean {
  return healthy;
}
