import { useEffect, useState } from "react";
import { wakeLockService, type WakeStatus } from "../lib/wakeLock";

export function useWakeLock(running: boolean): WakeStatus {
  const [status, setStatus] = useState<WakeStatus>(wakeLockService.current());

  useEffect(() => wakeLockService.subscribe(setStatus), []);

  useEffect(() => {
    void wakeLockService.setDesired(running);
  }, [running]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && running) {
        void wakeLockService.request();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [running]);

  return status;
}
