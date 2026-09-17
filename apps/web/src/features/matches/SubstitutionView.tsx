import type { Player } from "@tyloo/shared";
import { useState } from "react";
import { PlayerCard } from "../../components/PlayerCard";
import { Button } from "../../components/ui/Button";

export function SubstitutionView({
  onField,
  bench,
  onSave,
  onCancel,
}: {
  onField: Player[];
  bench: Player[];
  onSave: (playerOffId: string, playerOnId: string) => void;
  onCancel: () => void;
}) {
  const [offId, setOffId] = useState<string | null>(null);
  const [onId, setOnId] = useState<string | null>(null);

  return (
    <section className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-primary bg-surface px-4 py-3">
        <h1 className="text-3xl font-bold">Substitution</h1>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4">
        <section>
          <h2 className="mb-3 text-xl font-bold">Player off</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {onField.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                selected={offId === player.id}
                onSelect={() => setOffId(player.id)}
              />
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-bold">Player on</h2>
          {bench.length === 0 ? (
            <p className="text-text-muted">No bench players are in this squad.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {bench.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={onId === player.id}
                  onSelect={() => setOnId(player.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t-2 border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!offId || !onId}
          onClick={() => offId && onId && onSave(offId, onId)}
        >
          Save substitution
        </Button>
      </div>
    </section>
  );
}
