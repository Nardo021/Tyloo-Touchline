import { deriveMatchReport } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const events = useLiveQuery(() => (id ? db.events.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const roster = useLiveQuery(() => (id ? db.matchPlayers.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);

  if (!match) {
    return <p>That match is not stored on this device.</p>;
  }

  const report = deriveMatchReport(events, roster.map((item) => item.playerId));
  const playerName = (playerId: string) => players.find((player) => player.id === playerId)?.name ?? "Unknown";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Match report</h1>
        <p className="mt-2 text-xl font-semibold">
          {settings?.teamName ?? "Tyloo FC"} {report.scoreFor}–{report.scoreAgainst} {match.opponent}
        </p>
        <p>{match.date} · {match.competition}</p>
      </div>

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

      <section>
        <h2 className="text-2xl font-bold">Players</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="py-2 pe-3">Player</th>
                <th className="py-2 pe-3">Goals</th>
                <th className="py-2 pe-3">Assists</th>
                <th className="py-2 pe-3">Shots</th>
                <th className="py-2 pe-3">On target</th>
                <th className="py-2 pe-3">Saves</th>
                <th className="py-2 pe-3">Fouls</th>
                <th className="py-2 pe-3">Cards</th>
                <th className="py-2">Key defence</th>
              </tr>
            </thead>
            <tbody>
              {report.players.map((player) => (
                <tr key={player.playerId} className="border-b border-border">
                  <td className="py-2 pe-3 font-semibold">{playerName(player.playerId)}</td>
                  <td className="py-2 pe-3 tabular-nums">{player.goals}</td>
                  <td className="py-2 pe-3 tabular-nums">{player.assists}</td>
                  <td className="py-2 pe-3 tabular-nums">{player.shots}</td>
                  <td className="py-2 pe-3 tabular-nums">{player.shotsOnTarget}</td>
                  <td className="py-2 pe-3 tabular-nums">{player.saves}</td>
                  <td className="py-2 pe-3 tabular-nums">{player.fouls}</td>
                  <td className="py-2 pe-3 tabular-nums">
                    {player.yellowCards}Y {player.redCards}R
                  </td>
                  <td className="py-2 tabular-nums">{player.keyDefences + player.interceptions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to={`/match/${match.id}/live`}>
          <Button>Back to match</Button>
        </Link>
        <Link to={`/match/${match.id}/timeline`}>
          <Button>Timeline</Button>
        </Link>
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
