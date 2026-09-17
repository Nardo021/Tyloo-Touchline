import {
  applyGoalkeeperToSlots,
  formatMatchTime,
  assignSlotPlayer,
  inheritSlotOnSubstitution,
  playerShirtLabel,
  type LineupSlot,
  type Player,
} from "@tyloo/shared";
import { useMemo, useState } from "react";
import { PlayerCard } from "../../components/PlayerCard";
import { Button } from "../../components/ui/Button";

export function SubstitutionView({
  onField,
  bench,
  goalkeeperId,
  matchTimeMs,
  slots,
  onSave,
  onCancel,
}: {
  onField: Player[];
  bench: Player[];
  goalkeeperId: string | null;
  matchTimeMs: number;
  slots?: LineupSlot[];
  onSave: (playerOffId: string, playerOnId: string, nextGoalkeeperId?: string, nextSlots?: LineupSlot[]) => void;
  onCancel: () => void;
}) {
  const [offId, setOffId] = useState<string | null>(null);
  const [onId, setOnId] = useState<string | null>(null);
  const [nextGoalkeeperId, setNextGoalkeeperId] = useState<string | null>(null);
  const [incomingSlotId, setIncomingSlotId] = useState<string | null>(null);

  const replacingGoalkeeper = Boolean(offId && offId === goalkeeperId);
  const nextOnField = useMemo(() => {
    if (!offId || !onId) {
      return onField;
    }
    const incoming = bench.find((player) => player.id === onId);
    return onField
      .filter((player) => player.id !== offId)
      .concat(incoming ? [incoming] : []);
  }, [bench, offId, onField, onId]);

  const canSave = Boolean(offId && onId && offId !== onId && (!replacingGoalkeeper || nextGoalkeeperId));

  return (
    <section className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-primary bg-surface px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-3xl font-bold">Substitution</h1>
          <p className="text-2xl font-bold tabular-nums">{formatMatchTime(matchTimeMs)}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4">
        <section>
          <h2 className="mb-3 text-xl font-bold uppercase tracking-wide">Player off</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {onField.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isGoalkeeper={player.id === goalkeeperId}
                selected={offId === player.id}
                onSelect={() => {
                  setOffId(player.id);
                  setNextGoalkeeperId(null);
                }}
              />
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-bold uppercase tracking-wide">Player on</h2>
          {bench.length === 0 ? (
            <p className="text-text-muted">No bench players are in this squad.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {bench.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={onId === player.id}
                  onSelect={() => {
                    setOnId(player.id);
                    setNextGoalkeeperId(null);
                  }}
                />
              ))}
            </div>
          )}
        </section>
        {offId && onId && slots && slots.length > 0 ? (
          <section>
            <h2 className="mb-3 text-xl font-bold uppercase tracking-wide">Incoming role</h2>
            <p className="mb-3">Defaults to the slot being vacated. Tap another slot to change it.</p>
            <div className="grid grid-cols-2 gap-3">
              {slots.map((slot) => {
                const inherited = slot.playerId === offId;
                const selected = (incomingSlotId ?? slots.find((item) => item.playerId === offId)?.slotId) === slot.slotId;
                return (
                  <Button
                    key={slot.slotId}
                    variant={selected ? "primary" : "secondary"}
                    aria-pressed={selected}
                    onClick={() => setIncomingSlotId(slot.slotId)}
                  >
                    {slot.role}{inherited ? " · vacated" : ""}
                  </Button>
                );
              })}
            </div>
          </section>
        ) : null}
        {replacingGoalkeeper && offId && onId ? (
          <section className="rounded-lg border-2 border-primary bg-surface p-4">
            <h2 className="text-xl font-bold uppercase tracking-wide">New goalkeeper</h2>
            <p className="mt-2 text-base">
              {playerShirtLabel(onField.find((player) => player.id === offId) ?? { number: 0, name: "Current GK" })} is the
              current goalkeeper. Select who will be goalkeeper after this substitution.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
              {nextOnField.map((player) => (
                <label
                  key={player.id}
                  className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-border bg-background px-3 py-2"
                >
                  <input
                    type="radio"
                    name="next-goalkeeper"
                    checked={nextGoalkeeperId === player.id}
                    onChange={() => setNextGoalkeeperId(player.id)}
                    className="size-5"
                  />
                  <span className="text-lg font-semibold">{playerShirtLabel(player)}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t-2 border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!canSave}
          onClick={() => {
            if (!offId || !onId) {
              return;
            }
            let nextSlots = slots ? inheritSlotOnSubstitution(slots, offId, onId) : undefined;
            if (nextSlots && incomingSlotId) {
              nextSlots = assignSlotPlayer(nextSlots, incomingSlotId, onId);
            }
            if (nextSlots && nextGoalkeeperId) {
              nextSlots = applyGoalkeeperToSlots(nextSlots, nextGoalkeeperId);
            }
            onSave(offId, onId, nextGoalkeeperId ?? undefined, nextSlots);
          }}
        >
          Save substitution
        </Button>
      </div>
    </section>
  );
}
