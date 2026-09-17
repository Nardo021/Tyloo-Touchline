type RecoveryListener = () => void;

const listeners = new Set<RecoveryListener>();
let started = false;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeVisibilityRecovery(listener: RecoveryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startVisibilityRecovery(): void {
  if (started || typeof document === "undefined") {
    return;
  }
  started = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      notify();
    }
  });
  window.addEventListener("pageshow", () => {
    notify();
  });
}

export function runVisibilityRecoveryNow(): void {
  notify();
}
