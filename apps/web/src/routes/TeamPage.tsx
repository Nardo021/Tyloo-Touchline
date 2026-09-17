import { useLiveQuery } from "dexie-react-hooks";
import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { db } from "../db/database";
import { playerService } from "../features/players/playerService";
import { LocalWriteError } from "../lib/localWrite";
import { markStorageUnavailable } from "../features/storage/storageHealth";

export function TeamPage() {
  const players = useLiveQuery(async () => {
    const all = await db.players.toArray();
    return all.sort((a, b) => a.number - b.number);
  }, []) ?? [];
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || number === "") {
      return;
    }
    setError(null);
    try {
      await playerService.save({
        id: editingId ?? undefined,
        number: Number(number),
        name,
        position: position || null,
        active: true,
      });
      setNumber("");
      setName("");
      setPosition("");
      setEditingId(null);
    } catch (err) {
      const write = err instanceof LocalWriteError ? err : null;
      setError(write?.message ?? "The player was not written to this iPad.");
      markStorageUnavailable(write?.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Team</h1>
      <p>Add shirt numbers and names. No player accounts are required.</p>
      {error ? <p className="font-semibold text-danger" role="alert">{error}</p> : null}

      <form className="grid max-w-3xl gap-4 md:grid-cols-4" onSubmit={(event) => void onSave(event)}>
        <Field label="Number" htmlFor="number">
          <Input id="number" inputMode="numeric" value={number} onChange={(event) => setNumber(event.target.value)} />
        </Field>
        <Field label="Name" htmlFor="name">
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Position (optional)" htmlFor="position">
          <Input id="position" value={position} onChange={(event) => setPosition(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button variant="primary" type="submit" className="w-full">
            {editingId ? "Update player" : "Add player"}
          </Button>
        </div>
      </form>

      {players.length === 0 ? (
        <p>No players yet. Add Leo, Maxwell, and the rest of the squad here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 border-2 border-border bg-surface px-4 py-3">
              <p className="text-xl font-bold">
                <span className="tabular-nums">{player.number}</span> {player.name}
                {player.position ? <span className="ms-2 text-base font-semibold text-text-muted">{player.position}</span> : null}
                {!player.active ? <span className="ms-2 text-base">Inactive</span> : null}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setEditingId(player.id);
                    setNumber(String(player.number));
                    setName(player.name);
                    setPosition(player.position ?? "");
                  }}
                >
                  Edit
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await playerService.save({
                        id: player.id,
                        number: player.number,
                        name: player.name,
                        position: player.position,
                        active: !player.active,
                      });
                    } catch (err) {
                      markStorageUnavailable(err instanceof LocalWriteError ? err.message : undefined);
                    }
                  }}
                >
                  {player.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
