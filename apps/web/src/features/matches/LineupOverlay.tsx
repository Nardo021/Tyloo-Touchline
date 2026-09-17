import type { FormationSnapshot, FormationType, Player } from "@tyloo/shared";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";

export function LineupOverlay({
  open,
  formation,
  snapshot,
  players,
  onClose,
  onChangeLineup,
}: {
  open: boolean;
  formation: FormationType | string;
  snapshot: FormationSnapshot | null;
  players: Player[];
  onClose: () => void;
  onChangeLineup?: () => void;
}) {
  return (
    <Dialog open={open} title="Current lineup" onClose={onClose}>
      <p className="text-2xl font-bold">{formation}</p>
      {snapshot ? <LineupRoleList slots={snapshot.slots} players={players} /> : <p className="mt-3">No lineup snapshot is stored yet.</p>}
      <div className="mt-4 flex flex-col gap-3">
        {onChangeLineup ? (
          <Button variant="primary" onClick={onChangeLineup}>
            Change lineup
          </Button>
        ) : null}
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

export function LineupRoleList({
  slots,
  players,
}: {
  slots: FormationSnapshot["slots"];
  players: Player[];
}) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <RoleBlock label="FWD" slots={slots} role="FWD" players={players} />
      <RoleBlock label="MID" slots={slots} role="MID" players={players} />
      <RoleBlock label="DEF" slots={slots} role="DEF" players={players} />
      <RoleBlock label="GK" slots={slots} role="GK" players={players} />
    </div>
  );
}

function RoleBlock({
  label,
  slots,
  role,
  players,
}: {
  label: string;
  slots: FormationSnapshot["slots"];
  role: "FWD" | "MID" | "DEF" | "GK";
  players: Player[];
}) {
  const items = slots.filter((slot) => slot.role === role);
  if (items.length === 0) {
    return null;
  }
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">{label}</h3>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((slot) => {
          const player = players.find((item) => item.id === slot.playerId);
          return (
            <li key={slot.slotId} className="text-xl font-semibold">
              {player ? `${player.number} ${player.name}` : "Unassigned"}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
