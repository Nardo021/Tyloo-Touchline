import { CLOCK_DISPLAY_INTERVAL_MS, displayedElapsedMs, type MatchClockState } from "@tyloo/shared";
import { useEffect, useState } from "react";
import { subscribeVisibilityRecovery } from "../pwa/visibilityRecovery";

export function useClockDisplay(clock: MatchClockState | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, CLOCK_DISPLAY_INTERVAL_MS);
    const unsubscribe = subscribeVisibilityRecovery(() => {
      setNow(Date.now());
    });
    return () => {
      window.clearInterval(id);
      unsubscribe();
    };
  }, []);

  if (!clock) {
    return 0;
  }
  return displayedElapsedMs(clock, now);
}
