import { useEffect, useState } from "react";
import { wakeLockService, type WakeStatus } from "../lib/wakeLock";
import { subscribeVisibilityRecovery } from "../pwa/visibilityRecovery";

export function useWakeLock(running: boolean, enabled = true): WakeStatus {
  const [status, setStatus] = useState<WakeStatus>(wakeLockService.current());

  useEffect(() => wakeLockService.subscribe(setStatus), []);

  useEffect(() => {
    void wakeLockService.setDesired(enabled && running);
    return () => {
      if (!enabled) {
        void wakeLockService.release();
      }
    };
  }, [enabled, running]);

  useEffect(() => {
    return subscribeVisibilityRecovery(() => {
      if (enabled && running) {
        void wakeLockService.onVisible();
      }
    });
  }, [enabled, running]);

  return status;
}
