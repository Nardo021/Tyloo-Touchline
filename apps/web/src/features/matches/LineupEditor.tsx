import {
  assignSlotPlayer,
  emptySlots,
  FORMATION_TYPES,
  playerShirtLabel,
  remapSlotsToFormation,
  validateLineup,
  type FormationType,
  type LineupSlot,
  type Player,
} from "@tyloo/shared";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { FormationBoard } from "./FormationBoard";

export function LineupEditor({
  formation,
  slots,
  onField,
  candidates,
  onChange,
}: {
  formation: FormationType;
  slots: LineupSlot[];
  onField: Player[];
  candidates?: Player[];
  onChange: (formation: FormationType, slots: LineupSlot[]) => void;
}) {
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const validation = validateLineup(
    formation,
    slots,
    onField.map((player) => player.id),
  );

  function selectFormation(next: FormationType) {
    const goalkeeperId = slots.find((slot) => slot.role === "GK")?.playerId ?? "";
    const remapped = slots.every((slot) => !slot.playerId)
      ? emptySlots(next)
      : remapSlotsToFormation(slots, next, onField.map((player) => player.id), goalkeeperId);
    setActiveSlotId(null);
    onChange(next, remapped);
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-3 text-xl font-bold uppercase tracking-wide">Formation</h2>
        <div className="grid grid-cols-2 gap-3">
          {FORMATION_TYPES.map((item) => (
            <Button
              key={item}
              variant={formation === item ? "primary" : "secondary"}
              aria-pressed={formation === item}
              onClick={() => selectFormation(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </section>

      <FormationBoard
        formation={formation}
        slots={slots}
        players={onField}
        selectedSlotId={activeSlotId}
        onSelectSlot={(slotId) => setActiveSlotId((current) => (current === slotId ? null : slotId))}
      />

      {activeSlotId ? (
        <section className="rounded-lg border-2 border-primary bg-surface p-4">
          <h3 className="text-lg font-bold">Assign player</h3>
          <p className="mt-1">Choose from the current six on-field players.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {(candidates ?? onField).map((player) => (
              <Button
                key={player.id}
                className="min-h-14 justify-start"
                onClick={() => {
                  onChange(formation, assignSlotPlayer(slots, activeSlotId, player.id));
                  setActiveSlotId(null);
                }}
              >
                {playerShirtLabel(player)}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {validation.ok ? null : (
        <p className="font-semibold" role="status">
          {validation.errors[0]}
        </p>
      )}
    </div>
  );
}
