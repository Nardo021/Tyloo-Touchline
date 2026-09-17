import { clockPhaseLabel, deriveScore, formatMatchTime, displayedElapsedMs } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";

export function HomePage() {
  const matches = useLiveQuery(() => db.matches.orderBy("date").reverse().toArray(), []) ?? [];
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const active = matches.find((match) => match.status !== "FINISHED");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Tyloo Live</h1>
        <p className="mt-2 max-w-xl text-pretty text-text-muted">
          Record the match by tapping a shirt number, choosing what happened, and saving.
        </p>
      </div>

      {active ? (
        <section className="rounded-lg border-2 border-primary bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide">Active match found</h2>
          <p className="mt-2 text-2xl font-bold">
            {settings?.teamName ?? "Tyloo FC"} {scoreLine(active.id, events)} {active.opponent}
          </p>
          <p className="mt-1 font-semibold">
            {clockPhaseLabel(active.clock.phase, active.clock.period, active.periodCount)}
            {active.clock.running ? " · Clock was running." : ""}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            Current match time: {formatMatchTime(displayedElapsedMs(active.clock, Date.now()))}
          </p>
          <Link to={`/match/${active.id}/live`} className="mt-4 inline-block">
            <Button variant="primary" className="min-h-14 px-8 text-xl">
              Resume match
            </Button>
          </Link>
        </section>
      ) : (
        <section className="rounded-lg border-2 border-border bg-surface p-5">
          <h2 className="text-2xl font-bold">No matches yet</h2>
          <p className="mt-2">Create your first match to begin recording.</p>
          <Link to="/matches/new" className="mt-4 inline-block">
            <Button variant="primary">New match</Button>
          </Link>
        </section>
      )}

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

function scoreLine(matchId: string, events: Array<{ matchId: string; type: string; status: string }>): string {
  const score = deriveScore(
    events.filter((event) => event.matchId === matchId) as never,
  );
  return `${score.for}–${score.against}`;
}
