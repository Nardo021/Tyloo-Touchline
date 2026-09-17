import { clockPhaseLabel, getFullTimeScore, getPeriodResult, resolveMatchPhase, resumePathForPhase } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { db } from "../db/database";

export function MatchesPage() {
  const matches = useLiveQuery(() => db.matches.orderBy("date").reverse().toArray(), []) ?? [];
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Matches</h1>
        <Link to="/matches/new">
          <Button variant="primary">New match</Button>
        </Link>
      </div>
      {matches.length === 0 ? (
        <p>No matches yet. Create your first match to begin recording.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((match) => {
            const matchEvents = events.filter((event) => event.matchId === match.id);
            const score = getFullTimeScore(matchEvents);
            const ht = getPeriodResult(matchEvents, 1);
            return (
              <li key={match.id} className="rounded-lg border-2 border-border bg-surface p-4">
                <p className="text-xl font-bold">
                  {match.date} · vs {match.opponent}
                </p>
                <p className="font-semibold">
                  {score.for}–{score.against} · {clockPhaseLabel(match.clock.phase, match.clock.period, match.periodCount)}
                </p>
                <p className="font-semibold">HT {ht.goalsFor}–{ht.goalsAgainst} · FT {score.for}–{score.against}</p>
                <p className="text-text-muted">{match.competition}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    to={resolveMatchPhase(match) === "FULL_TIME" ? `/match/${match.id}/report` : resumePathForPhase(match.id, resolveMatchPhase(match))}
                    className="font-semibold underline"
                  >
                    {resolveMatchPhase(match) === "FULL_TIME" ? "Match report" : "Resume"}
                  </Link>
                  <Link to={`/match/${match.id}/report`} className="font-semibold underline">
                    Report
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
