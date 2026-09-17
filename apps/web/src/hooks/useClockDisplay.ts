import { CLOCK_DISPLAY_INTERVAL_MS, displayedElapsedMs, type MatchClockState } from "@tyloo/shared";
import { useEffect, useState } from "react";

export function useClockDisplay(clock: MatchClockState | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, CLOCK_DISPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!clock) {
    return 0;
  }
  return displayedElapsedMs(clock, now);
}
