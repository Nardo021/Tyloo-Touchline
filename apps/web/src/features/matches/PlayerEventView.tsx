import {
  EVENT_BUTTON_LABELS,
  PLAYER_EVENT_GRID,
  PLAYER_EVENT_MORE,
  type Player,
  type PlayerEventType,
} from "@tyloo/shared";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";

export function PlayerEventView({
  player,
  teammates,
  onSave,
  onCancel,
}: {
  player: Player;
  teammates: Player[];
  onSave: (type: PlayerEventType, assistPlayerId: string | null) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PlayerEventType | null>(null);
  const [assistPlayerId, setAssistPlayerId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const options = showMore ? [...PLAYER_EVENT_GRID, ...PLAYER_EVENT_MORE] : [...PLAYER_EVENT_GRID];

  return (
    <section className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-primary bg-surface px-4 py-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">What happened?</p>
        <div className="mt-1 flex items-end gap-3">
          <p className="text-5xl font-bold leading-none tabular-nums">{player.number}</p>
          <p className="text-3xl font-bold">{player.name}</p>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-2 gap-3 p-4">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={type === option}
            onClick={() => {
              setType(option);
              if (option !== "GOAL") {
                setAssistPlayerId(null);
              }
            }}
            className={cn(
              "min-h-16 rounded-lg border-2 px-3 py-4 text-lg font-bold uppercase tracking-wide",
              "active:scale-[0.96] motion-safe:transition-transform",
              type === option
                ? option === "RED_CARD"
                  ? "border-danger bg-danger text-danger-foreground"
                  : "border-primary bg-primary text-primary-foreground"
                : option === "RED_CARD"
                  ? "border-danger bg-surface text-danger"
                  : "border-border bg-surface text-text",
            )}
          >
            {EVENT_BUTTON_LABELS[option]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          className="min-h-16 rounded-lg border-2 border-border bg-surface px-3 py-4 text-lg font-bold uppercase"
        >
          {showMore ? "Less" : "More"}
        </button>
      </div>

      {type === "GOAL" ? (
        <fieldset className="border-t-2 border-border px-4 py-3">
          <legend className="text-base font-bold">Assisted by</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant={assistPlayerId === null ? "primary" : "secondary"}
              onClick={() => setAssistPlayerId(null)}
            >
              No assist
            </Button>
            {teammates
              .filter((mate) => mate.id !== player.id)
              .map((mate) => (
                <Button
                  key={mate.id}
                  variant={assistPlayerId === mate.id ? "primary" : "secondary"}
                  onClick={() => setAssistPlayerId(mate.id)}
                >
                  {mate.number} {mate.name}
                </Button>
              ))}
          </div>
        </fieldset>
      ) : null}

      <div className="sticky bottom-0 flex gap-3 border-t-2 border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!type}
          onClick={() => type && onSave(type, assistPlayerId)}
        >
          Save event
        </Button>
      </div>
    </section>
  );
}
