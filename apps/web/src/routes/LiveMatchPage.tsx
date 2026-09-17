import {
  canEndMatch,
  canEndPeriod,
  canPause,
  canResume,
  canStart,
  emptySlots,
  formatMatchTime,
  formatPeriodEventTime,
  periodHeading,
  playerShirtLabel,
  remapSlotsToFormation,
  resolveMatchPhase,
  RECENT_EVENT_LIMIT,
  UNDO_WINDOW_MS,
  validateLiveRuntimeState,
  type FormationType,
  type LineupSlot,
  type MatchEvent,
  type Player,
  type PlayerEventType,
} from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MatchReadyList } from "../components/MatchReady";
import { PlayerCard } from "../components/PlayerCard";
import { StorageBanner } from "../components/StorageBanner";
import { WakeStatusText } from "../components/StatusPills";
import { UpdateBanner } from "../components/UpdateBanner";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { db, getAppSettings, getSetting, SETTING_KEYS, setSetting } from "../db/database";
import { clockService } from "../features/clock/clockService";
import { eventService } from "../features/events/eventService";
import { ChangeGoalkeeperView } from "../features/matches/ChangeGoalkeeperView";
import { ChangeLineupView } from "../features/matches/ChangeLineupView";
import { LineupOverlay } from "../features/matches/LineupOverlay";
import { PlayerEventView } from "../features/matches/PlayerEventView";
import { SubstitutionView } from "../features/matches/SubstitutionView";
import { lifecycleService } from "../features/matches/lifecycleService";
import { lineupService } from "../features/matches/lineupService";
import { markStorageUnavailable } from "../features/storage/storageHealth";
import { useAppRecovery } from "../hooks/useAppRecovery";
import { useClockDisplay } from "../hooks/useClockDisplay";
import { useUpdateAvailability } from "../hooks/useUpdateAvailability";
import { useWakeLock } from "../hooks/useWakeLock";
import { LocalWriteError } from "../lib/localWrite";
import { evaluateReadiness, type OfflineReadiness } from "../pwa/offlineReadiness";

type Overlay = "none" | "player" | "sub" | "gk" | "corner" | "lineup";

export function LiveMatchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const events = useLiveQuery(() => (id ? db.events.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const assignments = useLiveQuery(() => (id ? db.matchPlayers.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const runtime = useLiveQuery(() => (id ? db.matchRuntimeStates.get(id) : undefined), [id]);
  const snapshot = useLiveQuery(
    () => (runtime?.formationSnapshotId ? db.formationSnapshots.get(runtime.formationSnapshotId) : undefined),
    [runtime?.formationSnapshotId],
  );
  const preMatchDraft = useLiveQuery(() => (id ? db.lineupDrafts.get(id) : undefined), [id]);
  const settings = useLiveQuery(() => getAppSettings(), []);
  const helpSeen = useLiveQuery(() => getSetting(SETTING_KEYS.helpSeen, false), []);
  const updateAvailable = useUpdateAvailability();

  const [overlay, setOverlay] = useState<Overlay>("none");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<"end-half" | "end" | "reset" | "delete" | null>(null);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [editFormation, setEditFormation] = useState<FormationType>("2-1-2");
  const [editSlots, setEditSlots] = useState<LineupSlot[]>([]);
  const [toast, setToast] = useState<{ event: MatchEvent; until: number } | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);
  const [helpDismissed, setHelpDismissed] = useState(false);
  const [readiness, setReadiness] = useState<OfflineReadiness | null>(null);
  const skipCompletedRedirect = useRef(false);

  const elapsed = useClockDisplay(match?.clock);
  const keepAwake = settings?.keepAwake ?? true;
  const wake = useWakeLock(match?.clock.running ?? false, keepAwake);
  useAppRecovery(match?.clock.running ?? false);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const onFieldIds = runtime?.onFieldPlayerIds ?? assignments.filter((item) => item.onField).map((item) => item.playerId);
  const onField = onFieldIds
    .map((playerId) => playerById.get(playerId))
    .filter((player): player is Player => Boolean(player));
  const bench = assignments
    .filter((item) => !onFieldIds.includes(item.playerId))
    .map((item) => playerById.get(item.playerId))
    .filter((player): player is Player => Boolean(player))
    .sort((a, b) => a.number - b.number);
  const goalkeeperId = runtime?.goalkeeperId || null;
  const activeEvents = events.filter((event) => event.status === "ACTIVE");
  const scoreFor = activeEvents.filter((event) => event.type === "GOAL").length;
  const scoreAgainst = activeEvents.filter((event) => event.type === "GOAL_AGAINST" || event.type === "OWN_GOAL").length;
  const recent = [...activeEvents].sort((a, b) => b.createdAt - a.createdAt).slice(0, RECENT_EVENT_LIMIT);
  const lineupValid = validateLiveRuntimeState({
    squadPlayerIds: assignments.map((item) => item.playerId),
    onFieldPlayerIds: onFieldIds,
    goalkeeperId,
  }).ok;

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
    const timeout = window.setTimeout(() => setSavedFlash(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [savedFlash]);

  useEffect(() => {
    if (match?.status === "NOT_STARTED") {
      void evaluateReadiness().then(setReadiness);
    }
  }, [match?.status]);

  useEffect(() => {
    if (!match || !id) {
      return;
    }
    const phase = resolveMatchPhase(match);
    if (phase === "HALF_TIME") {
      navigate(`/match/${id}/summary/1`, { replace: true });
    }
    if (phase === "FULL_TIME" && !skipCompletedRedirect.current) {
      navigate(`/match/${id}/report`, { replace: true });
    }
  }, [id, match, navigate]);

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
  const nameOf = (playerId: string | null) => {
    if (!playerId) {
      return "Team";
    }
    const player = playerById.get(playerId);
    return player ? playerShirtLabel(player) : "Unknown player";
  };

  async function afterSave(event: MatchEvent) {
    setOverlay("none");
    setSelectedPlayer(null);
    setSaveError(null);
    setRetryAction(null);
    setToast({ event, until: Date.now() + UNDO_WINDOW_MS });
    setSavedFlash(`${formatMatchTime(event.matchTimeMs)} · ${eventService.describe(event, nameOf)}`);
  }

  async function runWrite(action: () => Promise<void>, failure = "The event was not written to this iPad.") {
    try {
      await action();
    } catch (error) {
      const message = error instanceof LocalWriteError ? error.message : failure;
      setSaveError(message);
      setRetryAction(() => async () => {
        await runWrite(action, failure);
      });
      markStorageUnavailable(message);
    }
  }

  async function savePlayerEvent(type: PlayerEventType, assistPlayerId: string | null) {
    if (!selectedPlayer) {
      return;
    }
    const player = selectedPlayer;
    await runWrite(async () => {
      const event = await eventService.recordPlayerEvent({
        matchId: currentMatch.id,
        playerId: player.id,
        type,
        assistPlayerId,
      });
      await afterSave(event);
    });
  }

  if (overlay === "player" && selectedPlayer) {
    return (
      <PlayerEventView
        player={selectedPlayer}
        teammates={onField}
        isGoalkeeper={selectedPlayer.id === goalkeeperId}
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
        goalkeeperId={goalkeeperId}
        matchTimeMs={elapsed}
        onCancel={() => setOverlay("none")}
        formation={snapshot?.formation}
        slots={snapshot?.slots}
        onSave={async (playerOffId, playerOnId, nextGoalkeeperId, nextSlots) => {
          await runWrite(async () => {
            const result = await eventService.recordSubstitutionGroup(
              currentMatch.id,
              playerOffId,
              playerOnId,
              nextGoalkeeperId,
              nextSlots,
            );
            const primary = result.events[0];
            if (primary) {
              await afterSave(primary);
            }
          }, "The substitution was not written to this iPad.");
        }}
      />
    );
  }

  if (overlay === "gk") {
    return (
      <ChangeGoalkeeperView
        onField={onField}
        goalkeeperId={goalkeeperId}
        onCancel={() => setOverlay("none")}
        onSave={async (newGoalkeeperId) => {
          await runWrite(async () => {
            if (!goalkeeperId) {
              await lineupService.assignMissingGoalkeeper(currentMatch.id, newGoalkeeperId);
              setOverlay("none");
              setSavedFlash("Goalkeeper set");
              return;
            }
            const result = await eventService.recordGoalkeeperChange(currentMatch.id, newGoalkeeperId);
            const primary = result.events[0];
            if (primary) {
              await afterSave(primary);
            }
          }, "The goalkeeper change was not written to this iPad.");
        }}
      />
    );
  }

  if (overlay === "lineup") {
    return (
      <ChangeLineupView
        formation={editFormation}
        slots={editSlots}
        onField={onField}
        onChange={(nextFormation, nextSlots) => {
          setEditFormation(nextFormation);
          setEditSlots(nextSlots);
        }}
        onCancel={() => setOverlay("none")}
        onSave={() => {
          void runWrite(async () => {
            const result = await lifecycleService.changeLineup({
              matchId: currentMatch.id,
              formation: editFormation,
              slots: editSlots,
            });
            setOverlay("none");
            const primary = result.events[0];
            if (primary) {
              await afterSave(primary);
            } else {
              setSavedFlash("Lineup updated");
            }
          }, "The lineup change was not written to this iPad.");
        }}
      />
    );
  }

  const phase = resolveMatchPhase(match);
  const formationLabel = snapshot?.formation ?? preMatchDraft?.formation ?? match.startingFormation ?? "—";
  const periodActionLabel = phase === "SECOND_HALF" || match.clock.period > 1 ? "End match" : "End first half";

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-text">
      <StorageBanner />
      <UpdateBanner visible={updateAvailable && currentMatch.status === "FINISHED"} />
      <header className="sticky top-0 z-20 border-b-2 border-primary bg-surface pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))] py-3 pe-[max(1rem,env(safe-area-inset-right))]">
          <div>
            <p className="text-xl font-bold md:text-2xl">{settings?.teamName ?? "Tyloo FC"}</p>
            <p className="text-sm font-semibold uppercase tracking-wide">{periodHeading(match.clock.period, match.periodCount)}</p>
            <p className="text-5xl font-bold leading-none tabular-nums md:text-6xl" aria-live="polite" aria-atomic="true">
              {formatMatchTime(elapsed)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold tabular-nums md:text-5xl" aria-label={`Score ${scoreFor} to ${scoreAgainst}`}>
              {scoreFor} — {scoreAgainst}
            </p>
            <Button
              className="mt-2 min-h-11"
              onClick={() => setLineupOpen(true)}
            >
              {formationLabel} · View lineup
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-[max(1rem,env(safe-area-inset-left))] py-2 pe-[max(1rem,env(safe-area-inset-right))] text-sm font-semibold">
          <p>
            <span aria-hidden="true">● </span>
            Saved locally
            <span className="mx-2">·</span>
            <WakeStatusText status={wake} />
          </p>
          <div className="flex flex-wrap gap-2">
            {canStart(match.clock) ? (
              <Button
                variant="primary"
                disabled={!lineupValid}
                onClick={() => void runWrite(async () => {
                  const draft = preMatchDraft;
                  const slots = draft?.slots ?? snapshot?.slots ?? emptySlots(draft?.formation ?? "2-1-2");
                  await lifecycleService.startFirstHalf({
                    matchId: currentMatch.id,
                    formation: draft?.formation ?? snapshot?.formation ?? match.startingFormation ?? "2-1-2",
                    slots: slots.every((slot) => slot.playerId)
                      ? slots
                      : remapSlotsToFormation(slots, draft?.formation ?? "2-1-2", onFieldIds, goalkeeperId ?? ""),
                  });
                }, "The first half could not be started on this iPad.")}
              >
                Start first half
              </Button>
            ) : null}
            {canPause(match.clock) ? (
              <Button onClick={() => void runWrite(async () => {
                await clockService.transition(currentMatch.id, "PAUSE");
              }, "The clock could not be paused on this iPad.")}>Pause</Button>
            ) : null}
            {canResume(match.clock) ? (
              <Button variant="primary" onClick={() => void runWrite(async () => {
                await clockService.transition(currentMatch.id, "RESUME");
              }, "The clock could not be resumed on this iPad.")}>
                Resume
              </Button>
            ) : null}
            {canEndPeriod(match.clock) && phase === "FIRST_HALF" ? (
              <Button variant="warning" onClick={() => setConfirm("end-half")}>{periodActionLabel}</Button>
            ) : null}
            {canEndMatch(match.clock) && phase === "SECOND_HALF" ? (
              <Button variant="warning" onClick={() => setConfirm("end")}>{periodActionLabel}</Button>
            ) : null}
            <Button aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
              More
            </Button>
          </div>
        </div>
        {menuOpen ? (
          <div className="flex flex-wrap gap-2 border-t border-border bg-background px-4 py-3" role="menu">
            {canEndMatch(match.clock) && phase === "SECOND_HALF" ? (
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

      <main className="flex-1 px-[max(1rem,env(safe-area-inset-left))] py-4 pe-[max(1rem,env(safe-area-inset-right))]">
        <h1 className="sr-only">Live match against {match.opponent}</h1>
        {match.status === "NOT_STARTED" ? (
          <section className="mb-6 rounded-lg border-2 border-primary bg-surface p-4">
            <h2 className="text-2xl font-bold">Match ready</h2>
            <div className="mt-3">
              <MatchReadyList readiness={readiness} />
            </div>
            {!lineupValid ? (
              <p className="mt-3 font-semibold">
                Select a starting goalkeeper and confirm 6 on-field players before kick-off.
              </p>
            ) : null}
          </section>
        ) : null}

        {!goalkeeperId ? (
          <section className="mb-6 rounded-lg border-2 border-warning bg-surface p-4">
            <h2 className="text-xl font-bold">Select the current goalkeeper</h2>
            <p className="mt-2">This match does not yet have a goalkeeper role assigned.</p>
            <Button className="mt-3" variant="primary" onClick={() => setOverlay("gk")}>
              Choose goalkeeper
            </Button>
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 text-lg font-bold uppercase tracking-wide">On field</h2>
          {onField.length === 0 ? (
            <p>No players are on the field. Add a squad from match setup.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {onField.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isGoalkeeper={player.id === goalkeeperId}
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
          <h2 className="mb-3 text-lg font-bold uppercase tracking-wide text-text-muted">Bench</h2>
          {bench.length === 0 ? (
            <p>No bench players in this squad.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
              {bench.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  compact
                  onSelect={() => setOverlay("sub")}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold uppercase tracking-wide">Team events</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Button className="min-h-16 text-lg" onClick={() => setOverlay("corner")}>
              Corner
            </Button>
            <Button className="min-h-16 text-lg" onClick={() => setOverlay("sub")}>
              Substitution
            </Button>
            <Button
              className="min-h-16 text-lg"
              onClick={() => {
                setEditFormation(snapshot?.formation ?? preMatchDraft?.formation ?? "2-1-2");
                setEditSlots(
                  snapshot?.slots
                  ?? preMatchDraft?.slots
                  ?? remapSlotsToFormation(emptySlots("2-1-2"), "2-1-2", onFieldIds, goalkeeperId ?? ""),
                );
                setOverlay("lineup");
              }}
            >
              Change lineup
            </Button>
            <Button className="min-h-16 text-lg" onClick={() => setOverlay("gk")}>
              Change GK
            </Button>
            <Button className="min-h-16 text-lg" onClick={() => void runWrite(async () => {
              const event = await eventService.recordTeamEvent(currentMatch.id, "GOAL_AGAINST");
              await afterSave(event);
            })}>
              Opp goal
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
                    <span className="tabular-nums">{formatPeriodEventTime(event.period, event.matchTimeMs, currentMatch.periodCount)}</span>{" "}
                    {eventService.describe(event, nameOf)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      {toast ? (
        <div className="sticky bottom-0 border-t-2 border-success bg-surface px-[max(1rem,env(safe-area-inset-left))] py-3 pe-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="status">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{eventService.describe(toast.event, nameOf)} recorded</p>
            <Button
              onClick={() => void runWrite(async () => {
                await eventService.voidEvent(toast.event.id);
                setToast(null);
              }, "The event could not be voided on this iPad.")}
            >
              Undo
            </Button>
          </div>
        </div>
      ) : null}

      {savedFlash ? (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-30 flex justify-center px-4">
          <p className="rounded-md border-2 border-success bg-surface px-4 py-3 text-xl font-bold" role="status">
            ✓ Saved · {savedFlash}
          </p>
        </div>
      ) : null}

      <Dialog open={overlay === "corner"} title="Which corner?" onClose={() => setOverlay("none")}>
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            onClick={() => void runWrite(async () => {
              const event = await eventService.recordTeamEvent(currentMatch.id, "CORNER_FOR");
              await afterSave(event);
            })}
          >
            Corner for us
          </Button>
          <Button
            onClick={() => void runWrite(async () => {
              const event = await eventService.recordTeamEvent(currentMatch.id, "CORNER_AGAINST");
              await afterSave(event);
            })}
          >
            Opponent corner
          </Button>
          <Button onClick={() => setOverlay("none")}>Cancel</Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(saveError)}
        title="Could not save event"
        onClose={() => {
          setSaveError(null);
          setRetryAction(null);
        }}
      >
        <p>The event was not written to this iPad.</p>
        {saveError ? <p className="mt-2 font-semibold">{saveError}</p> : null}
        <div className="mt-4 flex gap-3">
          <Button
            onClick={() => {
              setSaveError(null);
              setRetryAction(null);
            }}
          >
            Close
          </Button>
          {retryAction ? (
            <Button
              variant="primary"
              onClick={() => {
                const retry = retryAction;
                setSaveError(null);
                setRetryAction(null);
                void retry();
              }}
            >
              Try again
            </Button>
          ) : null}
        </div>
      </Dialog>

      <LineupOverlay
        open={lineupOpen}
        formation={formationLabel}
        snapshot={snapshot ?? null}
        players={players}
        onClose={() => setLineupOpen(false)}
        onChangeLineup={phase === "FIRST_HALF" || phase === "SECOND_HALF" ? () => {
          setLineupOpen(false);
          setEditFormation(snapshot?.formation ?? "2-1-2");
          setEditSlots(snapshot?.slots ?? emptySlots("2-1-2"));
          setOverlay("lineup");
        } : undefined}
      />

      <Dialog
        open={confirm === "end-half"}
        title="End the first half?"
        onClose={() => setConfirm(null)}
      >
        <p>Current time: {formatMatchTime(elapsed)}</p>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => void runWrite(async () => {
              await lifecycleService.endFirstHalf(currentMatch.id);
              setConfirm(null);
              navigate(`/match/${currentMatch.id}/summary/1`);
            }, "The first half could not be ended on this iPad.")}
          >
            End first half
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirm === "end"}
        title="Finish the match?"
        onClose={() => setConfirm(null)}
      >
        <p>End second half and finish match.</p>
        <p className="mt-2 font-semibold">Second half: {formatMatchTime(elapsed)}</p>
        <p className="font-semibold">Score: {settings?.teamName ?? "Tyloo FC"} {scoreFor}–{scoreAgainst} {currentMatch.opponent}</p>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => void runWrite(async () => {
              skipCompletedRedirect.current = true;
              await lifecycleService.endMatch(currentMatch.id);
              setConfirm(null);
              navigate(`/match/${currentMatch.id}/summary/2`);
            }, "The match could not be ended on this iPad.")}
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
            onClick={() => void runWrite(async () => {
              await clockService.transition(currentMatch.id, "RESET");
              setConfirm(null);
            }, "The clock could not be reset on this iPad.")}
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
          <li>Tap an on-field player</li>
          <li>Select what happened</li>
          <li>Tap Save</li>
        </ol>
        <p className="mt-3">Use Substitution and Change GK below the players when the lineup changes.</p>
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
