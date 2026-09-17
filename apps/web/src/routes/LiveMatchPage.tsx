import {
  canEndMatch,
  canEndPeriod,
  canPause,
  canResume,
  canStart,
  canStartNextPeriod,
  clockPhaseLabel,
  formatMatchTime,
  RECENT_EVENT_LIMIT,
  UNDO_WINDOW_MS,
  type MatchEvent,
  type Player,
  type PlayerEventType,
} from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlayerCard } from "../components/PlayerCard";
import { SyncStatusText, WakeStatusText } from "../components/StatusPills";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { db, getSetting, SETTING_KEYS, setSetting } from "../db/database";
import { clockService } from "../features/clock/clockService";
import { eventService } from "../features/events/eventService";
import { PlayerEventView } from "../features/matches/PlayerEventView";
import { SubstitutionView } from "../features/matches/SubstitutionView";
import { requestSync } from "../features/sync/syncService";
import { useClockDisplay } from "../hooks/useClockDisplay";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { useWakeLock } from "../hooks/useWakeLock";

type Overlay = "none" | "player" | "sub" | "corner";

export function LiveMatchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const events = useLiveQuery(() => (id ? db.events.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const assignments = useLiveQuery(() => (id ? db.matchPlayers.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, { teamName: "Tyloo FC" }), []);
  const helpSeen = useLiveQuery(() => getSetting(SETTING_KEYS.helpSeen, false), []);

  const [overlay, setOverlay] = useState<Overlay>("none");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [benchOpen, setBenchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<"end" | "reset" | "delete" | null>(null);
  const [toast, setToast] = useState<{ event: MatchEvent; until: number } | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [helpDismissed, setHelpDismissed] = useState(false);

  const sync = useSyncStatus();
  const elapsed = useClockDisplay(match?.clock);
  const wake = useWakeLock(match?.clock.running ?? false);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const onField = assignments
    .filter((item) => item.onField)
    .map((item) => playerById.get(item.playerId))
    .filter((player): player is Player => Boolean(player))
    .sort((a, b) => a.number - b.number);
  const bench = assignments
    .filter((item) => !item.onField)
    .map((item) => playerById.get(item.playerId))
    .filter((player): player is Player => Boolean(player))
    .sort((a, b) => a.number - b.number);

  const activeEvents = events.filter((event) => event.status === "ACTIVE");
  const scoreFor = activeEvents.filter((event) => event.type === "GOAL").length;
  const scoreAgainst = activeEvents.filter((event) => event.type === "GOAL_AGAINST" || event.type === "OWN_GOAL").length;
  const recent = [...activeEvents].sort((a, b) => b.createdAt - a.createdAt).slice(0, RECENT_EVENT_LIMIT);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), Math.max(0, toast.until - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!savedFlash) {
      return;
    }
    const timeout = window.setTimeout(() => setSavedFlash(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [savedFlash]);

  if (!id) {
    return <p>Match not found on this device.</p>;
  }
  if (match === undefined) {
    return <p>Opening match from this iPad…</p>;
  }
  if (!match) {
    return (
      <div className="p-6">
        <p>That match is not stored on this device.</p>
        <Link to="/matches" className="font-semibold underline">
          Back to matches
        </Link>
      </div>
    );
  }

  const currentMatch = match;
  const nameOf = (playerId: string | null) =>
    playerId ? (playerById.get(playerId)?.name ?? "Unknown player") : "Team";

  async function afterSave(event: MatchEvent) {
    setOverlay("none");
    setSelectedPlayer(null);
    setToast({ event, until: Date.now() + UNDO_WINDOW_MS });
    setSavedFlash(`${formatMatchTime(event.matchTimeMs)} · ${eventService.describe(event, nameOf)}`);
    requestSync();
  }

  async function savePlayerEvent(type: PlayerEventType, assistPlayerId: string | null) {
    if (!selectedPlayer) {
      return;
    }
    const event = await eventService.recordPlayerEvent({
      matchId: currentMatch.id,
      playerId: selectedPlayer.id,
      type,
      assistPlayerId,
    });
    await afterSave(event);
  }

  if (overlay === "player" && selectedPlayer) {
    return (
      <PlayerEventView
        player={selectedPlayer}
        teammates={onField}
        onCancel={() => {
          setOverlay("none");
          setSelectedPlayer(null);
        }}
        onSave={(type, assistPlayerId) => void savePlayerEvent(type, assistPlayerId)}
      />
    );
  }

  if (overlay === "sub") {
    return (
      <SubstitutionView
        onField={onField}
        bench={bench}
        onCancel={() => setOverlay("none")}
        onSave={async (playerOffId, playerOnId) => {
          const event = await eventService.recordSubstitution(currentMatch.id, playerOffId, playerOnId);
          await afterSave(event);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-text">
      <header className="sticky top-0 z-20 border-b-2 border-primary bg-surface">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xl font-bold md:text-2xl">{settings?.teamName ?? "Tyloo FC"}</p>
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              {clockPhaseLabel(match.clock.phase, match.clock.period, match.periodCount)}
            </p>
          </div>
          <p className="text-5xl font-bold leading-none tabular-nums md:text-6xl" aria-live="polite" aria-atomic="true">
            {formatMatchTime(elapsed)}
          </p>
          <p className="text-4xl font-bold tabular-nums md:text-5xl" aria-label={`Score ${scoreFor} to ${scoreAgainst}`}>
            {scoreFor} — {scoreAgainst}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm font-semibold">
          <p>
            <span aria-hidden="true">● </span>
            <SyncStatusText state={sync.state} pending={sync.pending} />
            <span className="mx-2">·</span>
            <WakeStatusText status={wake} />
          </p>
          <div className="flex flex-wrap gap-2">
            {canStart(match.clock) ? (
              <Button variant="primary" onClick={() => void clockService.transition(currentMatch.id, "START")}>
                Start match
              </Button>
            ) : null}
            {canPause(match.clock) ? (
              <Button onClick={() => void clockService.transition(currentMatch.id, "PAUSE")}>Pause</Button>
            ) : null}
            {canResume(match.clock) ? (
              <Button variant="primary" onClick={() => void clockService.transition(currentMatch.id, "RESUME")}>
                Resume
              </Button>
            ) : null}
            {canEndPeriod(match.clock) ? (
              <Button onClick={() => void clockService.transition(currentMatch.id, "END_PERIOD")}>End period</Button>
            ) : null}
            {canStartNextPeriod(match.clock, match.periodCount) ? (
              <Button variant="primary" onClick={() => void clockService.transition(currentMatch.id, "START_NEXT_PERIOD")}>
                Start next period
              </Button>
            ) : null}
            <Button aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
              More
            </Button>
          </div>
        </div>
        {menuOpen ? (
          <div className="flex flex-wrap gap-2 border-t border-border bg-background px-4 py-3" role="menu">
            {canEndMatch(match.clock) ? (
              <Button variant="danger" onClick={() => setConfirm("end")}>
                End match
              </Button>
            ) : null}
            <Button onClick={() => setConfirm("reset")}>Reset clock</Button>
            <Link to={`/match/${currentMatch.id}/timeline`} className="inline-flex min-h-11 items-center font-semibold underline">
              Full timeline
            </Link>
            <Link to={`/match/${currentMatch.id}/report`} className="inline-flex min-h-11 items-center font-semibold underline">
              Report
            </Link>
            <Button onClick={() => navigate("/")}>Leave match screen</Button>
          </div>
        ) : null}
      </header>

      {sync.state !== "synced" && sync.pending > 0 ? (
        <p className="px-4 py-2 text-sm font-semibold" role="status">
          {sync.pending} events safely stored on this iPad. They will sync automatically.
        </p>
      ) : null}

      <main className="flex-1 px-4 py-4">
        <h1 className="sr-only">Live match against {match.opponent}</h1>
        <section>
          <h2 className="mb-3 text-lg font-bold uppercase tracking-wide">On field</h2>
          {onField.length === 0 ? (
            <p>No players are on the field. Add a squad from match setup.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {onField.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onSelect={() => {
                    setSelectedPlayer(player);
                    setOverlay("player");
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <button
            type="button"
            className="mb-3 text-lg font-bold uppercase tracking-wide underline"
            aria-expanded={benchOpen}
            onClick={() => setBenchOpen((value) => !value)}
          >
            Bench {benchOpen ? "hide" : "show"}
          </button>
          {benchOpen ? (
            bench.length === 0 ? (
              <p>No bench players in this squad.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {bench.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    onSelect={() => {
                      setSelectedPlayer(player);
                      setOverlay("player");
                    }}
                  />
                ))}
              </div>
            )
          ) : null}
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold uppercase tracking-wide">Team events</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Button className="min-h-16 text-lg" onClick={() => setOverlay("corner")}>
              Corner
            </Button>
            <Button
              className="min-h-16 text-lg"
              onClick={async () => {
                const event = await eventService.recordTeamEvent(currentMatch.id, "GOAL_AGAINST");
                await afterSave(event);
              }}
            >
              Opp goal
            </Button>
            <Button className="min-h-16 text-lg" onClick={() => setOverlay("sub")}>
              Substitution
            </Button>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold uppercase tracking-wide">Recent</h2>
            <Link to={`/match/${currentMatch.id}/timeline`} className="font-semibold underline">
              Full timeline
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-2">No events yet. Tap a player to record what happens.</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2">
              {recent.map((event) => (
                <li key={event.id} className="rounded-md border-2 border-border bg-surface px-3 py-2">
                  <p className="font-semibold">
                    <span className="tabular-nums">{formatMatchTime(event.matchTimeMs)}</span>{" "}
                    {eventService.describe(event, nameOf)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      {toast ? (
        <div className="sticky bottom-0 border-t-2 border-success bg-surface px-4 py-3" role="status">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{eventService.describe(toast.event, nameOf)} recorded</p>
            <Button
              onClick={async () => {
                await eventService.voidEvent(toast.event.id);
                setToast(null);
                requestSync();
              }}
            >
              Undo
            </Button>
          </div>
        </div>
      ) : null}

      {savedFlash ? (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-30 flex justify-center px-4">
          <p className="rounded-md border-2 border-success bg-surface px-4 py-3 text-xl font-bold" role="status">
            Saved · {savedFlash}
          </p>
        </div>
      ) : null}

      <Dialog open={overlay === "corner"} title="Which corner?" onClose={() => setOverlay("none")}>
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            onClick={async () => {
              const event = await eventService.recordTeamEvent(currentMatch.id, "CORNER_FOR");
              await afterSave(event);
            }}
          >
            Corner for us
          </Button>
          <Button
            onClick={async () => {
              const event = await eventService.recordTeamEvent(currentMatch.id, "CORNER_AGAINST");
              await afterSave(event);
            }}
          >
            Opponent corner
          </Button>
          <Button onClick={() => setOverlay("none")}>Cancel</Button>
        </div>
      </Dialog>

      <Dialog
        open={confirm === "end"}
        title="End this match?"
        onClose={() => setConfirm(null)}
      >
        <p>This stops the clock and closes match recording.</p>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => setConfirm(null)}>Keep recording</Button>
          <Button
            variant="danger"
            onClick={async () => {
              await clockService.transition(currentMatch.id, "END_MATCH");
              setConfirm(null);
              navigate(`/match/${currentMatch.id}/report`);
            }}
          >
            End match
          </Button>
        </div>
      </Dialog>

      <Dialog open={confirm === "reset"} title="Reset the clock?" onClose={() => setConfirm(null)}>
        <p>The match time will return to 00:00. Recorded events stay in the timeline.</p>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => setConfirm(null)}>Keep clock</Button>
          <Button
            variant="danger"
            onClick={async () => {
              await clockService.transition(currentMatch.id, "RESET");
              setConfirm(null);
            }}
          >
            Reset clock
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={helpSeen === false && !helpDismissed}
        title="Recording a match"
        onClose={() => {
          setHelpDismissed(true);
          void setSetting(SETTING_KEYS.helpSeen, true);
        }}
      >
        <ol className="flex list-decimal flex-col gap-2 ps-5">
          <li>Tap a player</li>
          <li>Select what happened</li>
          <li>Tap Save</li>
        </ol>
        <p className="mt-3">Team events are available below the players.</p>
        <Button
          className="mt-4 w-full"
          variant="primary"
          onClick={() => {
            setHelpDismissed(true);
            void setSetting(SETTING_KEYS.helpSeen, true);
          }}
        >
          Got it
        </Button>
      </Dialog>

    </div>
  );
}
