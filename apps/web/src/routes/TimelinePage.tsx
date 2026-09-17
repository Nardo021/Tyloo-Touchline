import { EVENT_LABELS, formatMatchTime } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { db } from "../db/database";
import { eventService } from "../features/events/eventService";
import { LocalWriteError } from "../lib/localWrite";
import { markStorageUnavailable } from "../features/storage/storageHealth";

export function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const events = useLiveQuery(() => (id ? db.events.where("matchId").equals(id).reverse().sortBy("createdAt") : []), [id]) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const [error, setError] = useState<string | null>(null);
  const nameOf = (playerId: string | null) =>
    playerId ? (players.find((player) => player.id === playerId)?.name ?? "Unknown") : "Team";

  if (!match) {
    return <p>That match is not stored on this device.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Timeline · vs {match.opponent}</h1>
      {error ? <p className="font-semibold text-danger" role="alert">{error}</p> : null}
      {events.length === 0 ? (
        <p>No events recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border-2 border-border bg-surface p-4">
              <p className="font-bold">
                <span className="tabular-nums">{formatMatchTime(event.matchTimeMs)}</span> · {EVENT_LABELS[event.type]}
              </p>
              <p>{eventService.describe(event, nameOf)}</p>
              <p className="text-sm text-text-muted">
                Period {event.period}
                {event.status === "VOIDED" ? " · Voided" : ""}
              </p>
              {event.status === "ACTIVE" ? (
                <Button
                  className="mt-3"
                  onClick={async () => {
                    try {
                      await eventService.voidEvent(event.id);
                      setError(null);
                    } catch (err) {
                      const message = err instanceof LocalWriteError ? err.message : "The event could not be voided.";
                      setError(message);
                      markStorageUnavailable(message);
                    }
                  }}
                >
                  Void event
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <Link to={`/match/${match.id}/live`}>
        <Button>Back to match</Button>
      </Link>
    </div>
  );
}
