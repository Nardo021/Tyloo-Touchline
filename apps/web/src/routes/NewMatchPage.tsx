import { DEFAULT_COMPETITION, DEFAULT_PERIOD_COUNT, DEFAULT_PERIOD_LENGTH_MS } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PlayerCard } from "../components/PlayerCard";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";
import { matchService } from "../features/matches/matchService";
import { requestSync } from "../features/sync/syncService";

export function NewMatchPage() {
  const navigate = useNavigate();
  const players = useLiveQuery(async () => {
    const all = await db.players.toArray();
    return all.filter((player) => player.active).sort((a, b) => a.number - b.number);
  }, []) ?? [];
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const [step, setStep] = useState(1);
  const [opponent, setOpponent] = useState("");
  const [competition, setCompetition] = useState(DEFAULT_COMPETITION);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodCount, setPeriodCount] = useState(settings?.defaultPeriodCount ?? DEFAULT_PERIOD_COUNT);
  const [periodMinutes, setPeriodMinutes] = useState(
    Math.round((settings?.defaultPeriodLengthMs ?? DEFAULT_PERIOD_LENGTH_MS) / 60000),
  );
  const [squadIds, setSquadIds] = useState<string[]>([]);
  const [starterIds, setStarterIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  async function createMatch(event: FormEvent) {
    event.preventDefault();
    if (!opponent.trim()) {
      setError("Enter the opponent name.");
      return;
    }
    if (squadIds.length === 0) {
      setError("Select at least one player for the squad.");
      setStep(2);
      return;
    }
    if (starterIds.length === 0) {
      setError("Select the starting lineup.");
      setStep(3);
      return;
    }
    const match = await matchService.create({
      opponent,
      competition,
      date,
      periodCount,
      periodLengthMs: periodMinutes * 60 * 1000,
      squadIds,
      starterIds,
    });
    requestSync();
    navigate(`/match/${match.id}/live`);
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => void createMatch(event)}>
      <h1 className="text-3xl font-bold">New match</h1>
      {error ? <p className="font-semibold text-danger">{error}</p> : null}

      {step === 1 ? (
        <div className="flex max-w-xl flex-col gap-4">
          <Field label="Opponent" htmlFor="opponent">
            <Input id="opponent" value={opponent} onChange={(event) => setOpponent(event.target.value)} />
          </Field>
          <Field label="Competition" htmlFor="competition">
            <Input id="competition" value={competition} onChange={(event) => setCompetition(event.target.value)} />
          </Field>
          <Field label="Date" htmlFor="date">
            <Input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Periods" htmlFor="periods">
            <Input
              id="periods"
              inputMode="numeric"
              value={periodCount}
              onChange={(event) => setPeriodCount(Number(event.target.value) || 2)}
            />
          </Field>
          <Field label="Period length (minutes)" htmlFor="length">
            <Input
              id="length"
              inputMode="numeric"
              value={periodMinutes}
              onChange={(event) => setPeriodMinutes(Number(event.target.value) || 20)}
            />
          </Field>
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setStep(2);
              if (squadIds.length === 0) {
                setSquadIds(players.map((player) => player.id));
              }
            }}
          >
            Next: squad
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Squad</h2>
          {players.length === 0 ? (
            <p>
              No active players yet. Add players on the{" "}
              <Link className="font-semibold underline" to="/team">
                team page
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={squadIds.includes(player.id)}
                  onSelect={() => setSquadIds(toggle(squadIds, player.id))}
                />
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button
              variant="primary"
              onClick={() => {
                setStarterIds((current) => current.filter((id) => squadIds.includes(id)));
                setStep(3);
              }}
            >
              Next: starting lineup
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Starting lineup</h2>
          <p>These players start on the field. Everyone else in the squad sits on the bench.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {players
              .filter((player) => squadIds.includes(player.id))
              .map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={starterIds.includes(player.id)}
                  onSelect={() => setStarterIds(toggle(starterIds, player.id))}
                />
              ))}
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button variant="primary" type="submit">
              Ready to start
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
