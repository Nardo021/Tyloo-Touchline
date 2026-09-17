import { clockPhaseLabel, deriveScore, formatMatchTime, resolveMatchPhase, resumePathForPhase, type MatchEvent } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MatchReadyList } from "../components/MatchReady";
import { Button } from "../components/ui/Button";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";
import { useClockDisplay } from "../hooks/useClockDisplay";
import { evaluateReadiness, type OfflineReadiness } from "../pwa/offlineReadiness";

export function HomePage() {
  const matches = useLiveQuery(() => db.matches.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const [readiness, setReadiness] = useState<OfflineReadiness | null>(null);
  const active = matches.find((match) => resolveMatchPhase(match) !== "FULL_TIME" && match.status !== "FINISHED");
  const elapsed = useClockDisplay(active?.clock);

  useEffect(() => {
    void evaluateReadiness().then(setReadiness);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Touchline</h1>
        <p className="mt-2 max-w-xl text-pretty text-text-muted">
          Record the match by tapping a shirt number, choosing what happened, and saving. Everything stays on this iPad.
        </p>
      </div>

      {active ? (
        <section className="rounded-lg border-2 border-primary bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide">Active match</h2>
          <p className="mt-2 text-2xl font-bold">
            {settings?.teamName ?? "Tyloo FC"} {scoreLine(active.id, events)} {active.opponent}
          </p>
          <p className="mt-1 text-xl font-semibold">
            {clockPhaseLabel(active.clock.phase, active.clock.period, active.periodCount)}
            {" · "}
            <span className="tabular-nums">{formatMatchTime(elapsed)}</span>
          </p>
          {resolveMatchPhase(active) === "HALF_TIME" ? (
            <p className="mt-1 text-lg font-semibold">First half complete.</p>
          ) : null}
          <Link to={resumePathForPhase(active.id, resolveMatchPhase(active))} className="mt-4 inline-block">
            <Button variant="primary" className="min-h-14 px-8 text-xl">
              {resolveMatchPhase(active) === "HALF_TIME"
                ? "Continue second-half setup"
                : resolveMatchPhase(active) === "PRE_MATCH"
                  ? "Open match"
                  : "Resume match"}
            </Button>
          </Link>
        </section>
      ) : (
        <section className="rounded-lg border-2 border-border bg-surface p-5">
          <h2 className="text-2xl font-bold">No active match</h2>
          <p className="mt-2">Create a match, then confirm this iPad is ready before kick-off.</p>
          <Link to="/matches/new" className="mt-4 inline-block">
            <Button variant="primary">New match</Button>
          </Link>
        </section>
      )}

      <section className="rounded-lg border-2 border-border bg-surface p-5">
        <h2 className="text-xl font-bold">Match ready</h2>
        <div className="mt-3">
          <MatchReadyList readiness={readiness} />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to="/matches/new">
          <Button variant="primary">New match</Button>
        </Link>
        <Link to="/matches">
          <Button>All matches</Button>
        </Link>
        <Link to="/team">
          <Button>Team</Button>
        </Link>
      </div>
    </div>
  );
}

function scoreLine(matchId: string, events: MatchEvent[]): string {
  const score = deriveScore(events.filter((event) => event.matchId === matchId));
  return `${score.for}–${score.against}`;
}
