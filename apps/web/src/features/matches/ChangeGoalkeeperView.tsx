import { playerShirtLabel, type Player } from "@tyloo/shared";
import { useState } from "react";
import { PlayerCard } from "../../components/PlayerCard";
import { Button } from "../../components/ui/Button";

export function ChangeGoalkeeperView({
  onField,
  goalkeeperId,
  onSave,
  onCancel,
}: {
  onField: Player[];
  goalkeeperId: string | null;
  onSave: (newGoalkeeperId: string) => void;
  onCancel: () => void;
}) {
  const current = onField.find((player) => player.id === goalkeeperId) ?? null;
  const candidates = onField.filter((player) => player.id !== goalkeeperId);
  const [nextId, setNextId] = useState<string | null>(null);

  return (
    <section className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-primary bg-surface px-4 py-3">
        <h1 className="text-3xl font-bold">Change goalkeeper</h1>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4">
        <section className="rounded-lg border-2 border-border bg-surface p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Current goalkeeper</h2>
          <p className="mt-2 text-2xl font-bold">{current ? `${playerShirtLabel(current)} GK` : "Not set"}</p>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-bold uppercase tracking-wide">New goalkeeper</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {candidates.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                selected={nextId === player.id}
                onSelect={() => setNextId(player.id)}
              />
            ))}
          </div>
        </section>
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t-2 border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-[2]" disabled={!nextId} onClick={() => nextId && onSave(nextId)}>
          Save change
        </Button>
      </div>
    </section>
  );
}
