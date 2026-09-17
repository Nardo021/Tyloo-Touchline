import {
  validateLineupSlots,
  type FormationType,
  type LineupSlot,
  type Player,
} from "@tyloo/shared";
import { Button } from "../../components/ui/Button";
import { LineupEditor } from "./LineupEditor";

export function ChangeLineupView({
  formation,
  slots,
  onField,
  onChange,
  onCancel,
  onSave,
}: {
  formation: FormationType;
  slots: LineupSlot[];
  onField: Player[];
  onChange: (formation: FormationType, slots: LineupSlot[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const validation = validateLineupSlots(
    formation,
    slots,
    onField.map((player) => player.id),
    slots.find((slot) => slot.role === "GK")?.playerId ?? null,
  );

  return (
    <section className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-primary bg-surface px-4 py-3">
        <h1 className="text-3xl font-bold">Change lineup</h1>
        <p className="mt-1">Rearrange the current six. This does not make a substitution.</p>
      </header>
      <div className="flex-1 p-4">
        <LineupEditor formation={formation} slots={slots} onField={onField} onChange={onChange} />
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t-2 border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-[2]" disabled={!validation.ok} onClick={onSave}>
          Save lineup
        </Button>
      </div>
    </section>
  );
}
