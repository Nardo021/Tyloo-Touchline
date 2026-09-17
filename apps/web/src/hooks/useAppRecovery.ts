import { useEffect } from "react";
import { matchService } from "../features/matches/matchService";
import { shouldPromptForUpdate } from "../pwa/updateManager";
import { subscribeVisibilityRecovery } from "../pwa/visibilityRecovery";
import { wakeLockService } from "../lib/wakeLock";

export function useAppRecovery(matchRunning: boolean): void {
  useEffect(() => {
    return subscribeVisibilityRecovery(() => {
      void matchService.active();
      if (matchRunning) {
        void wakeLockService.onVisible();
      }
      void shouldPromptForUpdate(matchRunning);
    });
  }, [matchRunning]);
}
