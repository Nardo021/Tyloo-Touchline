import {
  formatMatchTime,
  formatPeriodEventTime,
  playerShirtLabel,
  resolveMatchPhase,
  type MatchEvent,
  type Player,
} from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";
import { eventService } from "../features/events/eventService";
import { LineupRoleList } from "../features/matches/LineupOverlay";
import { buildPeriodSummary } from "../features/reports/reportService";

export function PeriodSummaryPage() {
  const { id, period: periodParam } = useParams<{ id: string; period: string }>();
  const navigate = useNavigate();
  const period = periodParam === "2" ? 2 : 1;
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const summary = useLiveQuery(() => (id ? buildPeriodSummary(id, period) : undefined), [id, period]);
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [openSnapshotId, setOpenSnapshotId] = useState<string | null>(null);

  if (match === undefined || summary === undefined) {
    return <p>Opening half summary from this iPad…</p>;
  }
  if (!match || !summary) {
    return <p>That match is not stored on this device.</p>;
  }

  const teamName = settings?.teamName ?? "Tyloo FC";
  const compactTimeline = summary.timeline
    .filter((event) => ["GOAL", "SAVE", "SUBSTITUTION", "YELLOW_CARD", "RED_CARD", "GOALKEEPER_CHANGE", "FORMATION_CHANGE"].includes(event.type))
    .slice(0, 6);
  const visibleTimeline = showFullTimeline ? summary.timeline : compactTimeline;
  const phase = resolveMatchPhase(match);
  const heading = period === 1 ? "FIRST-HALF SUMMARY" : "SECOND-HALF SUMMARY";
  const continueLabel = period === 1
    ? phase === "HALF_TIME" || phase === "PRE_MATCH"
      ? "Continue to half time"
      : "View half-time setup"
    : "View full match summary";
  const continueTo = period === 1 ? `/match/${match.id}/halftime` : `/match/${match.id}/report`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide">{heading}</p>
        <h1 className="text-3xl font-bold">{period === 1 ? "First half" : "Second half"}</h1>
        <p className="mt-2 text-2xl font-bold">
          {teamName} {summary.result.goalsFor} — {summary.result.goalsAgainst} {match.opponent}
        </p>
        <p className="mt-1 text-lg font-semibold">{formatMatchTime(summary.playedMs)} played</p>
        {period === 2 ? <p className="text-text-muted">Second-half scoring only.</p> : null}
      </div>

      <section>
        <h2 className="text-2xl font-bold">Team</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Goals" value={summary.report.team.goalsFor} />
          <Stat label="Shots" value={summary.report.team.shots} />
          <Stat label="Shots on target" value={summary.report.team.shotsOnTarget} />
          <Stat label="Corners" value={summary.report.team.cornersFor} />
          <Stat label="Fouls" value={summary.report.team.fouls} />
          <Stat label="Offsides" value={summary.report.team.offsides} />
          <Stat label="Saves" value={summary.report.team.saves} />
          <Stat label="Cards" value={summary.report.team.yellowCards + summary.report.team.redCards} />
        </dl>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Players</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {summary.report.players.map((stats) => {
            const player = players.find((item) => item.id === stats.playerId);
            const showGk = stats.goalkeeperTimeMs > 0 || stats.goalsConceded > 0;
            return (
              <article key={stats.playerId} className="rounded-lg border-2 border-border bg-surface p-4">
                <h3 className="text-xl font-bold">{player ? playerShirtLabel(player) : stats.playerId}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <Row label="Goals" value={stats.goals} />
                  <Row label="Assists" value={stats.assists} />
                  <Row label="Shots" value={stats.shots} />
                  <Row label="SOT" value={stats.shotsOnTarget} />
                  <Row label="Time played" value={formatMatchTime(stats.timePlayedMs)} />
                  {summary.roleDurations
                    .filter((item) => item.playerId === stats.playerId && item.durationMs > 0)
                    .map((item) => (
                      <Row key={`${item.role}-${item.period}`} label={`${item.role} time`} value={formatMatchTime(item.durationMs)} />
                    ))}
                  {showGk && !summary.roleDurations.some((item) => item.playerId === stats.playerId && item.role === "GK")
                    ? <Row label="GK time" value={formatMatchTime(stats.goalkeeperTimeMs)} />
                    : null}
                  {showGk ? <Row label="Saves" value={stats.saves} /> : null}
                  {showGk ? <Row label="Goals conceded" value={stats.goalsConceded} /> : null}
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Timeline</h2>
        {visibleTimeline.length === 0 ? (
          <p className="mt-2">No notable events in this half.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2">
            {visibleTimeline.map((event) => (
              <li key={event.id} className="rounded-md border-2 border-border bg-surface px-3 py-2 font-semibold">
                {describeTimeline(event, players)}
              </li>
            ))}
          </ol>
        )}
        {summary.timeline.length > compactTimeline.length ? (
          <Button className="mt-3" onClick={() => setShowFullTimeline((value) => !value)}>
            {showFullTimeline ? "Hide full timeline" : `View full ${period === 1 ? "first-half" : "second-half"} timeline`}
          </Button>
        ) : null}
      </section>

      <section>
        <h2 className="text-2xl font-bold">{period === 1 ? "Starting formation" : "Starting second-half formation"}</h2>
        <p className="mt-2 text-2xl font-bold">{summary.startingSnapshot?.formation ?? "—"}</p>
        {summary.startingSnapshot ? <LineupRoleList slots={summary.startingSnapshot.slots} players={players} /> : null}
        {summary.formationHistory.length > 1 ? (
          <div className="mt-4">
            <h3 className="text-lg font-bold uppercase tracking-wide">Formation history</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {summary.formationHistory.map((snapshot) => (
                <li key={snapshot.id}>
                  <Button
                    className="w-full justify-start"
                    onClick={() => setOpenSnapshotId((current) => (current === snapshot.id ? null : snapshot.id))}
                  >
                    {formatMatchTime(snapshot.effectiveMatchTimeMs)} {snapshot.formation}
                  </Button>
                  {openSnapshotId === snapshot.id ? <LineupRoleList slots={snapshot.slots} players={players} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => navigate(continueTo)}>
          {continueLabel}
        </Button>
        <Link to={`/match/${match.id}/report`}>
          <Button>Match report</Button>
        </Link>
        {phase === "FIRST_HALF" || phase === "SECOND_HALF" ? (
          <Link to={`/match/${match.id}/live`}>
            <Button>Back to live match</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function describeTimeline(event: MatchEvent, players: Player[]): string {
  const nameOf = (playerId: string | null) => {
    if (!playerId) {
      return "Team";
    }
    const player = players.find((item) => item.id === playerId);
    return player ? playerShirtLabel(player) : "Unknown";
  };
  return `${formatPeriodEventTime(event.period, event.matchTimeMs)} ${eventService.describe(event, nameOf)}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border-2 border-border bg-surface p-3">
      <dt className="text-sm font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="text-3xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-sm font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
