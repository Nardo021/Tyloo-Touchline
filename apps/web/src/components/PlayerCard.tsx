import { playerShirtLabel, type Player } from "@tyloo/shared";
import { cn } from "../lib/cn";

export function PlayerCard({
  player,
  onSelect,
  selected = false,
  isGoalkeeper = false,
  compact = false,
}: {
  player: Player;
  onSelect: () => void;
  selected?: boolean;
  isGoalkeeper?: boolean;
  compact?: boolean;
}) {
  const label = `${playerShirtLabel(player)}${isGoalkeeper ? " GK" : ""}${selected ? ", selected" : ""}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-lg border-2 px-3",
        "min-w-[8.5rem] active:scale-[0.96] motion-safe:transition-transform",
        compact ? "min-h-[72px] gap-0.5 py-2" : "min-h-[96px] gap-1 py-3",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : compact
            ? "border-border bg-background text-text-muted hover:bg-surface"
            : "border-primary bg-surface text-text hover:bg-background",
      )}
    >
      <span className={cn("font-bold leading-none tabular-nums", compact ? "text-3xl" : "text-[2.25rem] md:text-[2.5rem]")}>
        {player.number}
      </span>
      <span className={cn("font-semibold leading-tight", compact ? "text-lg" : "text-xl md:text-2xl")}>{player.name}</span>
      {isGoalkeeper ? (
        <span className={cn("font-bold uppercase tracking-wide", compact ? "text-sm" : "text-base")}>GK</span>
      ) : null}
      {selected ? <span className="text-sm font-bold uppercase tracking-wide">Selected</span> : null}
    </button>
  );
}
