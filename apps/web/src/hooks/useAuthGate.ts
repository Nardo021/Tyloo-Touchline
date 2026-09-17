import { useEffect, useState } from "react";
import { db } from "../db/database";
import { hasTrustedDevice } from "../lib/session";

export function useAuthGate(): { ready: boolean; allowed: boolean } {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await db.open();
        const trusted = await hasTrustedDevice();
        const unfinished = await db.matches.filter((match) => match.status !== "FINISHED").first();
        if (!cancelled) {
          setAllowed(trusted || Boolean(unfinished));
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          setReady(true);
        }
      }
    };
    void load();
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { ready, allowed };
}
