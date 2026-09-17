import {
  deriveLineupChanges,
  MATCH_ON_FIELD_SIZE,
  playerShirtLabel,
  swapPairOnPlayer,
  validateRuntimeState,
  type Player,
  type SubstitutionPair,
} from "@tyloo/shared";
import { useMemo, useState } from "react";
import { PlayerCard } from "../../components/PlayerCard";
import { Button } from "../../components/ui/Button";

export function HalfTimeView({
  teamName,
  opponent,
  scoreFor,
  scoreAgainst,
  squad,
  currentOnFieldIds,
  currentGoalkeeperId,
  nextPeriodLabel,
  onCancel,
  onStart,
}: {
  teamName: string;
  opponent: string;
  scoreFor: number;
  scoreAgainst: number;
  squad: Player[];
  currentOnFieldIds: string[];
  currentGoalkeeperId: string | null;
  nextPeriodLabel: string;
  onCancel: () => void;
  onStart: (nextOnFieldIds: string[], nextGoalkeeperId: string, pairs: SubstitutionPair[]) => void;
}) {
  const [nextOnFieldIds, setNextOnFieldIds] = useState<string[]>(currentOnFieldIds);
  const [goalkeeperId, setGoalkeeperId] = useState<string | null>(
    currentGoalkeeperId && currentOnFieldIds.includes(currentGoalkeeperId) ? currentGoalkeeperId : null,
  );
  const [pairs, setPairs] = useState<SubstitutionPair[]>(() => deriveLineupChanges(currentOnFieldIds, currentOnFieldIds).pairs);

  const byId = useMemo(() => new Map(squad.map((player) => [player.id, player])), [squad]);
  const bench = squad.filter((player) => !nextOnFieldIds.includes(player.id));
  const selectedStarters = squad.filter((player) => nextOnFieldIds.includes(player.id));
  const derived = deriveLineupChanges(currentOnFieldIds, nextOnFieldIds);
  const validation = validateRuntimeState({
    squadPlayerIds: squad.map((player) => player.id),
    onFieldPlayerIds: nextOnFieldIds,
    goalkeeperId,
  });

  function toggleStarter(playerId: string) {
    setNextOnFieldIds((current) => {
      if (current.includes(playerId)) {
        const next = current.filter((id) => id !== playerId);
        setPairs(deriveLineupChanges(currentOnFieldIds, next).pairs);
        if (goalkeeperId === playerId) {
          setGoalkeeperId(null);
        }
        return next;
      }
      if (current.length >= MATCH_ON_FIELD_SIZE) {
        return current;
      }
      const next = [...current, playerId];
      setPairs(deriveLineupChanges(currentOnFieldIds, next).pairs);
      return next;
    });
  }

  return (
    <section className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-primary bg-surface px-4 py-3">
        <h1 className="text-3xl font-bold">Half time</h1>
        <p className="mt-1 text-xl font-semibold">
          {teamName} {scoreFor} — {scoreAgainst} {opponent}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-xl font-bold uppercase tracking-wide">{nextPeriodLabel} lineup</h2>
            <p className="font-bold">{nextOnFieldIds.length} / {MATCH_ON_FIELD_SIZE} selected</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {squad.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                selected={nextOnFieldIds.includes(player.id)}
                isGoalkeeper={player.id === goalkeeperId}
                onSelect={() => toggleStarter(player.id)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-lg border-2 border-border bg-surface p-4">
          <h2 className="text-lg font-bold uppercase tracking-wide">Bench</h2>
          {bench.length === 0 ? (
            <p className="mt-2">Select six players to see the bench.</p>
          ) : (
            <p className="mt-2 text-lg font-semibold">
              {bench.map((player) => playerShirtLabel(player)).join(" · ")}
            </p>
          )}
        </section>

        {validation.ok ? (
          <section>
            <h2 className="mb-3 text-xl font-bold uppercase tracking-wide">{nextPeriodLabel} goalkeeper</h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {selectedStarters.map((player) => (
                <label key={player.id} className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-border bg-surface px-3">
                  <input
                    type="radio"
                    name="second-half-gk"
                    checked={goalkeeperId === player.id}
                    onChange={() => setGoalkeeperId(player.id)}
                    className="size-5"
                  />
                  <span className="text-lg font-semibold">{playerShirtLabel(player)}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {derived.pairs.length > 0 ? (
          <section className="rounded-lg border-2 border-border bg-surface p-4">
            <h2 className="text-lg font-bold uppercase tracking-wide">Half-time changes</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {(pairs.length === derived.pairs.length ? pairs : derived.pairs).map((pair, index) => {
                const offPlayer = byId.get(pair.playerOffId);
                const onPlayer = byId.get(pair.playerOnId);
                return (
                  <li
                    key={`${pair.playerOffId}-${pair.playerOnId}`}
                    className="flex flex-wrap items-center gap-3 text-lg font-semibold"
                    aria-label={`${offPlayer ? playerShirtLabel(offPlayer) : "Off"} off, ${onPlayer ? playerShirtLabel(onPlayer) : "On"} on`}
                  >
                    <span>{offPlayer ? playerShirtLabel(offPlayer) : "Off"}</span>
                    <span aria-hidden="true">→</span>
                    <span>{onPlayer ? playerShirtLabel(onPlayer) : "On"}</span>
                    {derived.entering.length > 1 ? (
                      <Button
                        onClick={() => {
                          const currentPairs = pairs.length === derived.pairs.length ? pairs : derived.pairs;
                          const nextOn = derived.entering[(derived.entering.indexOf(pair.playerOnId) + 1) % derived.entering.length];
                          if (nextOn) {
                            setPairs(swapPairOnPlayer(currentPairs, index, nextOn));
                          }
                        }}
                      >
                        Swap pairing
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <p>No substitutions. The same six stay on.</p>
        )}
      </div>

      <div className="sticky bottom-0 flex gap-3 border-t-2 border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="flex-1" onClick={onCancel}>
          Back
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!validation.ok}
          onClick={() => {
            if (!validation.ok || !goalkeeperId) {
              return;
            }
            onStart(nextOnFieldIds, goalkeeperId, pairs.length === derived.pairs.length ? pairs : derived.pairs);
          }}
        >
          Start {nextPeriodLabel.toLowerCase()}
        </Button>
      </div>
    </section>
  );
}
