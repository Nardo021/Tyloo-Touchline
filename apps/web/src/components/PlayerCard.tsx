import type { Player } from "@tyloo/shared";
import { cn } from "../lib/cn";

export function PlayerCard({
  player,
  onSelect,
  selected = false,
}: {
  player: Player;
  onSelect: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Shirt ${player.number}, ${player.name}`}
      className={cn(
        "flex min-h-[96px] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 py-3",
        "min-w-[9rem] active:scale-[0.96] motion-safe:transition-transform",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary bg-surface text-text hover:bg-background",
      )}
    >
      <span className="text-[2.25rem] font-bold leading-none tabular-nums md:text-[2.5rem]">{player.number}</span>
      <span className="text-xl font-semibold leading-tight md:text-2xl">{player.name}</span>
    </button>
  );
}
