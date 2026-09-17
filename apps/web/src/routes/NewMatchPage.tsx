import {
  DEFAULT_COMPETITION,
  DEFAULT_PERIOD_COUNT,
  DEFAULT_PERIOD_LENGTH_MS,
  MATCH_ON_FIELD_SIZE,
  MATCH_SQUAD_SIZE,
  playerShirtLabel,
  remapSlotsToFormation,
  validateLineup,
  validateRuntimeState,
  type FormationType,
  type LineupSlot,
} from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MatchReadyList } from "../components/MatchReady";
import { PlayerCard } from "../components/PlayerCard";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";
import { LineupEditor } from "../features/matches/LineupEditor";
import { matchService } from "../features/matches/matchService";
import { presetService } from "../features/presets/presetService";
import { LocalWriteError } from "../lib/localWrite";
import { evaluateReadiness, type OfflineReadiness } from "../pwa/offlineReadiness";

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
  const [goalkeeperId, setGoalkeeperId] = useState<string | null>(null);
  const [formation, setFormation] = useState<FormationType>("2-1-2");
  const [slots, setSlots] = useState<LineupSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<OfflineReadiness | null>(null);

  useEffect(() => {
    if (settings) {
      setPeriodCount(settings.defaultPeriodCount);
      setPeriodMinutes(Math.round(settings.defaultPeriodLengthMs / 60000));
    }
  }, [settings]);

  useEffect(() => {
    if (players.length > 0 && squadIds.length === 0) {
      setSquadIds(players.slice(0, MATCH_SQUAD_SIZE).map((player) => player.id));
    }
  }, [players, squadIds.length]);

  useEffect(() => {
    if (step === 5) {
      void evaluateReadiness().then(setReadiness);
    }
  }, [step]);

  const squadPlayers = useMemo(
    () => players.filter((player) => squadIds.includes(player.id)),
    [players, squadIds],
  );
  const benchPlayers = squadPlayers.filter((player) => !starterIds.includes(player.id));
  const validation = validateRuntimeState({
    squadPlayerIds: squadIds,
    onFieldPlayerIds: starterIds,
    goalkeeperId,
  });
  const formationValidation = validateLineup(formation, slots, squadIds);

  function toggleSquad(id: string) {
    setSquadIds((current) => {
      if (current.includes(id)) {
        const next = current.filter((item) => item !== id);
        setStarterIds((starters) => starters.filter((item) => item !== id && next.includes(item)));
        if (goalkeeperId === id) {
          setGoalkeeperId(null);
        }
        return next;
      }
      if (current.length >= MATCH_SQUAD_SIZE) {
        return current;
      }
      return [...current, id];
    });
  }

  function toggleStarter(id: string) {
    setStarterIds((current) => {
      if (current.includes(id)) {
        if (goalkeeperId === id) {
          setGoalkeeperId(null);
        }
        return current.filter((item) => item !== id);
      }
      if (current.length >= MATCH_ON_FIELD_SIZE) {
        return current;
      }
      return [...current, id];
    });
  }

  async function createMatch(event: FormEvent) {
    event.preventDefault();
    if (!opponent.trim()) {
      setError("Enter the opponent name.");
      return;
    }
    if (!validation.ok || !goalkeeperId || !formationValidation.ok) {
      setError(
        !validation.ok
          ? (validation.errors[0] ?? "The lineup is not valid.")
          : !goalkeeperId
            ? "Select the starting goalkeeper."
            : (formationValidation.ok ? "The formation is not valid." : formationValidation.errors[0] ?? "The formation is not valid."),
      );
      return;
    }
    try {
      const match = await matchService.create({
        opponent,
        competition,
        date,
        periodCount,
        periodLengthMs: periodMinutes * 60 * 1000,
        squadIds,
        starterIds,
        goalkeeperId,
        formation,
        slots,
      });
      navigate(`/match/${match.id}/live`);
    } catch (err) {
      setError(err instanceof LocalWriteError ? err.message : "The match was not written to this iPad.");
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => void createMatch(event)}>
      <h1 className="text-3xl font-bold">New match</h1>
      {error ? <p className="font-semibold text-danger" role="alert">{error}</p> : null}

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
            }}
          >
            Next: match lineup
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Match lineup</h2>
          <p>Tyloo FC matches use 8 squad players. The current active squad is preselected.</p>
          {players.length === 0 ? (
            <p>
              No active players yet. Add players on the{" "}
              <Link className="font-semibold underline" to="/team">
                team page
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={squadIds.includes(player.id)}
                  onSelect={() => toggleSquad(player.id)}
                />
              ))}
            </div>
          )}
          <p className="font-bold">{squadIds.length} / {MATCH_SQUAD_SIZE} selected</p>
          <div className="flex gap-3">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button
              variant="primary"
              disabled={squadIds.length !== MATCH_SQUAD_SIZE}
              onClick={() => {
                setStarterIds((current) => current.filter((id) => squadIds.includes(id)));
                setStep(3);
              }}
            >
              Next: select 6 starters
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Select 6 starters</h2>
          <p className="font-bold">{starterIds.length} / {MATCH_ON_FIELD_SIZE} selected</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {squadPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                selected={starterIds.includes(player.id)}
                onSelect={() => toggleStarter(player.id)}
              />
            ))}
          </div>
          <section className="rounded-lg border-2 border-border bg-surface p-4">
            <h3 className="text-lg font-bold uppercase tracking-wide">Bench</h3>
            <p className="mt-2 text-lg font-semibold">
              {benchPlayers.length === 0
                ? "The two unselected squad players sit on the bench."
                : benchPlayers.map((player) => playerShirtLabel(player)).join(" · ")}
            </p>
          </section>
          <div className="flex gap-3">
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button
              variant="primary"
              disabled={starterIds.length !== MATCH_ON_FIELD_SIZE}
              onClick={() => {
                if (goalkeeperId && !starterIds.includes(goalkeeperId)) {
                  setGoalkeeperId(null);
                }
                setStep(4);
              }}
            >
              Next: starting goalkeeper
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Starting goalkeeper</h2>
          <p>Only the six starting players can be goalkeeper. This is a match role, not a permanent position.</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {squadPlayers
              .filter((player) => starterIds.includes(player.id))
              .map((player) => (
                <label key={player.id} className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-border bg-surface px-3">
                  <input
                    type="radio"
                    name="starting-gk"
                    checked={goalkeeperId === player.id}
                    onChange={() => setGoalkeeperId(player.id)}
                    className="size-5"
                  />
                  <span className="text-lg font-semibold">{playerShirtLabel(player)}</span>
                </label>
              ))}
          </div>
          <section className="rounded-lg border-2 border-border bg-surface p-4">
            <h3 className="text-xl font-bold">Match ready</h3>
            <div className="mt-3">
              <MatchReadyList readiness={readiness} />
            </div>
          </section>
          <div className="flex gap-3">
            <Button onClick={() => setStep(3)}>Back</Button>
            <Button
              variant="primary"
              onClick={() => {
                const defaults = presetService.defaultSlots(1, squadPlayers);
                const nextSlots = defaults.slots.every((slot) => starterIds.includes(slot.playerId))
                  ? defaults.slots
                  : remapSlotsToFormation(defaults.slots, defaults.formation, starterIds, goalkeeperId ?? "");
                setFormation(defaults.formation);
                setSlots(nextSlots);
                setStep(5);
              }}
            >
              Next: first-half formation
            </Button>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">First-half formation</h2>
          <p>Default Tyloo preset is 2-1-2. You can change the six roles before kick-off.</p>
          <LineupEditor
            formation={formation}
            slots={slots}
            onField={squadPlayers.filter((player) => starterIds.includes(player.id))}
            onChange={(nextFormation, nextSlots) => {
              setFormation(nextFormation);
              setSlots(nextSlots);
            }}
          />
          <div className="flex gap-3">
            <Button onClick={() => setStep(4)}>Back</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!validation.ok || !formationValidation.ok || Boolean(readiness && !readiness.canStartMatch)}
            >
              Open match
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
