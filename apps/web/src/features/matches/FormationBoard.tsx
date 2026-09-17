import {
  playerShirtLabel,
  slotsByRole,
  slotsForFormation,
  type FormationType,
  type LineupSlot,
  type Player,
  type TacticalRole,
} from "@tyloo/shared";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";

const ROLE_HEADING: Record<TacticalRole, string> = {
  FWD: "Forward",
  MID: "Midfield",
  DEF: "Defence",
  GK: "Goalkeeper",
};

export function FormationBoard({
  formation,
  slots,
  players,
  selectedSlotId = null,
  onSelectSlot,
}: {
  formation: FormationType;
  slots: LineupSlot[];
  players: Player[];
  selectedSlotId?: string | null;
  onSelectSlot?: (slotId: string) => void;
}) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const grouped = slotsByRole(slots);
  const definitions = slotsForFormation(formation);
  const rows: TacticalRole[] = ["FWD", "MID", "DEF", "GK"];

  return (
    <div className="flex flex-col gap-5" aria-label={`${formation} lineup`}>
      {rows.map((role) => {
        const roleSlots = grouped[role];
        if (roleSlots.length === 0) {
          return null;
        }
        return (
          <section key={role} className="flex flex-col items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">{ROLE_HEADING[role]}</h3>
            <div className={cn("grid w-full gap-3", roleSlots.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {roleSlots.map((slot) => {
                const player = byId.get(slot.playerId);
                const definition = definitions.find((item) => item.slotId === slot.slotId);
                const selected = selectedSlotId === slot.slotId;
                const label = `${definition?.label ?? role} ${player ? playerShirtLabel(player) : "Empty"}`;
                if (!onSelectSlot) {
                  return (
                    <div key={slot.slotId} className="rounded-lg border-2 border-border bg-surface px-4 py-5 text-center">
                      <p className="text-sm font-bold uppercase tracking-wide">{role}</p>
                      <p className="mt-1 text-2xl font-bold">{player ? playerShirtLabel(player) : "—"}</p>
                    </div>
                  );
                }
                return (
                  <Button
                    key={slot.slotId}
                    className={cn("min-h-24 flex-col gap-1 text-xl", selected && "border-primary")}
                    variant={selected ? "primary" : "secondary"}
                    aria-pressed={selected}
                    aria-label={label}
                    onClick={() => onSelectSlot(slot.slotId)}
                  >
                    <span className="text-sm font-bold uppercase tracking-wide">{role}</span>
                    <span>{player ? playerShirtLabel(player) : "Tap to assign"}</span>
                    {selected ? <span className="text-sm font-bold uppercase tracking-wide">Selected</span> : null}
                  </Button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
