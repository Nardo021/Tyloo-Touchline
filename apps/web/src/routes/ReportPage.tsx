import { formatMatchTime, formatPeriodEventTime, playerShirtLabel, resolveMatchPhase } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";
import { backupService, downloadTextFile } from "../features/backup/backupService";
import { LineupRoleList } from "../features/matches/LineupOverlay";
import { buildFullMatchSummary, buildMatchReport } from "../features/reports/reportService";
import { UpdateBanner } from "../components/UpdateBanner";
import { useUpdateAvailability } from "../hooks/useUpdateAvailability";

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const events = useLiveQuery(() => (id ? db.events.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const roster = useLiveQuery(() => (id ? db.matchPlayers.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const runtime = useLiveQuery(() => (id ? db.matchRuntimeStates.get(id) : undefined), [id]);
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const updateAvailable = useUpdateAvailability();
  const report = useLiveQuery(() => (id ? buildMatchReport(id) : undefined), [id, events.length, roster.length, runtime?.updatedAt]);
  const full = useLiveQuery(() => (id ? buildFullMatchSummary(id) : undefined), [id, events.length, roster.length, runtime?.updatedAt]);
  const [view] = useState<"full" | "1" | "2">("full");

  if (match === undefined || report === undefined) {
    return <p>Opening match report from this iPad…</p>;
  }
  if (!match || !report) {
    return <p>That match is not stored on this device.</p>;
  }

  const playerById = new Map(players.map((player) => [player.id, player]));

  async function exportJson() {
    if (!id) {
      return;
    }
    const file = await backupService.exportMatch(id);
    if (file) {
      downloadTextFile(file.filename, file.json, "application/json");
    }
  }

  async function exportCsv() {
    if (!id) {
      return;
    }
    const file = await backupService.exportMatchCsv(id);
    if (file) {
      downloadTextFile(file.filename, file.csv, "text/csv");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <UpdateBanner visible={updateAvailable && match.status === "FINISHED"} />
      {match.status === "FINISHED" ? (
        <section className="rounded-lg border-2 border-primary bg-surface p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide">Match complete</h2>
          <p className="mt-2 text-xl font-semibold">
            {settings?.teamName ?? "Tyloo FC"} {report.scoreFor}–{report.scoreAgainst} {match.opponent}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => void exportJson()}>
              Export match
            </Button>
            <Button onClick={() => void exportCsv()}>Export events CSV</Button>
          </div>
        </section>
      ) : null}

      <div>
        <h1 className="text-3xl font-bold">{resolveMatchPhase(match) === "FULL_TIME" ? "FULL TIME" : "Match report"}</h1>
        <p className="mt-2 text-xl font-semibold">
          {settings?.teamName ?? "Tyloo FC"} {report.scoreFor}–{report.scoreAgainst} {match.opponent}
        </p>
        <p>{match.date} · {match.competition}</p>
        {full ? (
          <p className="mt-2 font-semibold">
            First half {full.firstHalf.goalsFor}–{full.firstHalf.goalsAgainst}
            <span className="mx-2">·</span>
            Second half {full.secondHalf.goalsFor}–{full.secondHalf.goalsAgainst}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3" role="tablist" aria-label="Match report">
        <Button variant={view === "full" ? "primary" : "secondary"} aria-pressed={view === "full"}>
          Full match
        </Button>
        <Link to={`/match/${match.id}/summary/1`}>
          <Button>First half</Button>
        </Link>
        <Link to={`/match/${match.id}/summary/2`}>
          <Button>Second half</Button>
        </Link>
      </div>

      {full ? (
        <section>
          <h2 className="text-2xl font-bold">Half comparison</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-left">
              <thead>
                <tr>
                  <th className="border-b-2 border-border py-2"> </th>
                  <th className="border-b-2 border-border py-2">1H</th>
                  <th className="border-b-2 border-border py-2">2H</th>
                  <th className="border-b-2 border-border py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Goals" a={full.firstHalfReport.team.goalsFor} b={full.secondHalfReport.team.goalsFor} />
                <CompareRow label="Shots" a={full.firstHalfReport.team.shots} b={full.secondHalfReport.team.shots} />
                <CompareRow label="SOT" a={full.firstHalfReport.team.shotsOnTarget} b={full.secondHalfReport.team.shotsOnTarget} />
                <CompareRow label="Corners" a={full.firstHalfReport.team.cornersFor} b={full.secondHalfReport.team.cornersFor} />
                <CompareRow label="Fouls" a={full.firstHalfReport.team.fouls} b={full.secondHalfReport.team.fouls} />
                <CompareRow label="Offsides" a={full.firstHalfReport.team.offsides} b={full.secondHalfReport.team.offsides} />
                <CompareRow label="Saves" a={full.firstHalfReport.team.saves} b={full.secondHalfReport.team.saves} />
                <CompareRow label="Yellow cards" a={full.firstHalfReport.team.yellowCards} b={full.secondHalfReport.team.yellowCards} />
                <CompareRow label="Red cards" a={full.firstHalfReport.team.redCards} b={full.secondHalfReport.team.redCards} />
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-2xl font-bold">Team</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Goals" value={report.team.goalsFor} />
          <Stat label="Shots" value={report.team.shots} />
          <Stat label="Shots on target" value={report.team.shotsOnTarget} />
          <Stat label="Corners" value={report.team.cornersFor} />
          <Stat label="Fouls" value={report.team.fouls} />
          <Stat label="Offsides" value={report.team.offsides} />
          <Stat label="Yellow cards" value={report.team.yellowCards} />
          <Stat label="Red cards" value={report.team.redCards} />
        </dl>
      </section>

      {full && full.snapshots.length > 0 ? (
        <section>
          <h2 className="text-2xl font-bold">Formation history</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border-2 border-border bg-surface p-4">
              <h3 className="text-lg font-bold">First half</h3>
              {full.snapshots.filter((snapshot) => snapshot.period === 1).map((snapshot) => (
                <p key={snapshot.id} className="mt-1 font-semibold">
                  {formatMatchTime(snapshot.effectiveMatchTimeMs)} {snapshot.formation}
                </p>
              ))}
              {full.snapshots.find((snapshot) => snapshot.period === 1) ? (
                <LineupRoleList slots={full.snapshots.find((snapshot) => snapshot.period === 1)?.slots ?? []} players={players} />
              ) : null}
            </article>
            <article className="rounded-lg border-2 border-border bg-surface p-4">
              <h3 className="text-lg font-bold">Second half</h3>
              {full.snapshots.filter((snapshot) => snapshot.period === 2).map((snapshot) => (
                <p key={snapshot.id} className="mt-1 font-semibold">
                  {formatMatchTime(snapshot.effectiveMatchTimeMs)} {snapshot.formation}
                </p>
              ))}
              {full.snapshots.find((snapshot) => snapshot.period === 2) ? (
                <LineupRoleList slots={full.snapshots.find((snapshot) => snapshot.period === 2)?.slots ?? []} players={players} />
              ) : null}
            </article>
          </div>
        </section>
      ) : null}

      {full ? (
        <section>
          <h2 className="text-2xl font-bold">Substitutions</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {full.substitutions.length === 0 ? <li>No substitutions.</li> : full.substitutions.map((event) => (
              <li key={event.id} className="font-semibold">
                {formatPeriodEventTime(event.period, event.matchTimeMs, match.periodCount)}{" "}
                {playerById.get(event.playerOffId) ? `${playerShirtLabel(playerById.get(event.playerOffId)!)} OFF` : "OFF"}{" "}
                / {playerById.get(event.playerOnId) ? `${playerShirtLabel(playerById.get(event.playerOnId)!)} ON` : "ON"}
              </li>
            ))}
          </ul>
          <h2 className="mt-6 text-2xl font-bold">Goalkeepers</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {full.goalkeeperStints.length === 0 ? (
              <li className="font-semibold">Starting goalkeeper for the stored match period.</li>
            ) : full.goalkeeperStints.map((stint) => {
              const keeper = playerById.get(stint.playerId);
              const halfStats = (stint.period === 1 ? full.firstHalfReport : full.secondHalfReport).players
                .find((item) => item.playerId === stint.playerId);
              return (
                <li key={`${stint.playerId}-${stint.period}-${stint.fromMs}`} className="font-semibold">
                  {keeper ? playerShirtLabel(keeper) : "GK"}
                  {" · "}
                  {stint.period === 1 ? "1H" : "2H"}{" "}
                  {formatMatchTime(stint.fromMs)}–{formatMatchTime(stint.toMs)}
                  {halfStats ? ` · Saves ${halfStats.saves} · Goals conceded ${halfStats.goalsConceded}` : null}
                </li>
              );
            })}
          </ul>
          {full.goalkeeperChanges.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {full.goalkeeperChanges.map((event) => (
                <li key={event.id} className="font-semibold">
                  {formatPeriodEventTime(event.period, event.matchTimeMs, match.periodCount)}{" "}
                  {playerById.get(event.previousGoalkeeperId) ? playerShirtLabel(playerById.get(event.previousGoalkeeperId)!) : "GK"}
                  {" → "}
                  {playerById.get(event.newGoalkeeperId) ? playerShirtLabel(playerById.get(event.newGoalkeeperId)!) : "GK"}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-2xl font-bold">Players</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {report.players.map((player) => {
            const identity = playerById.get(player.playerId);
            const showGk = player.goalkeeperTimeMs > 0 || player.goalsConceded > 0;
            return (
              <article key={player.playerId} className="rounded-lg border-2 border-border bg-surface p-4">
                <h3 className="text-xl font-bold">
                  {identity ? playerShirtLabel(identity) : player.playerId}
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-base">
                  <Row label="Time played" value={formatMatchTime(player.timePlayedMs)} />
                  {full ? (
                    <Row
                      label="1H / 2H"
                      value={`${formatMatchTime(full.firstHalfReport.players.find((item) => item.playerId === player.playerId)?.timePlayedMs ?? 0)} / ${formatMatchTime(full.secondHalfReport.players.find((item) => item.playerId === player.playerId)?.timePlayedMs ?? 0)}`}
                    />
                  ) : null}
                  {full?.roleDurations
                    .filter((item) => item.playerId === player.playerId && item.durationMs > 0)
                    .map((item) => (
                      <Row
                        key={`${item.role}-${item.period}`}
                        label={`${item.period === 1 ? "1H" : "2H"} ${item.role}`}
                        value={formatMatchTime(item.durationMs)}
                      />
                    ))}
                  <Row label="Goals" value={player.goals} />
                  <Row label="Assists" value={player.assists} />
                  <Row label="Shots" value={player.shots} />
                  <Row label="SOT" value={player.shotsOnTarget} />
                  <Row label="Saves" value={player.saves} />
                  <Row label="Fouls" value={player.fouls} />
                  <Row label="Cards" value={`${player.yellowCards}Y ${player.redCards}R`} />
                  <Row label="Key defence" value={player.keyDefences + player.interceptions} />
                  {showGk ? <Row label="GK time" value={formatMatchTime(player.goalkeeperTimeMs)} /> : null}
                  {showGk ? <Row label="Goals conceded" value={player.goalsConceded} /> : null}
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to={`/match/${match.id}/live`}>
          <Button>Back to match</Button>
        </Link>
        <Link to={`/match/${match.id}/timeline`}>
          <Button>Timeline</Button>
        </Link>
        {match.status !== "FINISHED" ? (
          <>
            <Button onClick={() => void exportJson()}>Export match JSON</Button>
            <Button onClick={() => void exportCsv()}>Export events CSV</Button>
          </>
        ) : null}
      </div>
    </div>
  );
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

function CompareRow({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <tr>
      <th className="py-2 font-semibold">{label}</th>
      <td className="py-2 tabular-nums">{a}</td>
      <td className="py-2 tabular-nums">{b}</td>
      <td className="py-2 font-bold tabular-nums">{a + b}</td>
    </tr>
  );
}
