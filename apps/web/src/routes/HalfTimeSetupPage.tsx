import {
  defaultSecondHalfPreset,
  deriveLineupChanges,
  MATCH_ON_FIELD_SIZE,
  playerShirtLabel,
  remapSlotsToFormation,
  resolveHalftimeInitialLineup,
  reviewLineupChange,
  swapPairOnPlayer,
  validateLineup,
  validateRuntimeState,
  type FormationType,
  type LineupSlot,
  type Player,
  type SubstitutionPair,
} from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlayerCard } from "../components/PlayerCard";
import { Button } from "../components/ui/Button";
import { db, defaultAppSettings, getSetting, SETTING_KEYS } from "../db/database";
import { LineupEditor } from "../features/matches/LineupEditor";
import { LineupRoleList } from "../features/matches/LineupOverlay";
import { lifecycleService } from "../features/matches/lifecycleService";
import { lineupService } from "../features/matches/lineupService";
import { presetService } from "../features/presets/presetService";
import { LocalWriteError } from "../lib/localWrite";

export function HalfTimeSetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const match = useLiveQuery(() => (id ? db.matches.get(id) : undefined), [id]);
  const assignments = useLiveQuery(() => (id ? db.matchPlayers.where("matchId").equals(id).toArray() : []), [id]) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];
  const runtime = useLiveQuery(() => (id ? db.matchRuntimeStates.get(id) : undefined), [id]);
  const draft = useLiveQuery(() => (id ? db.lineupDrafts.get(id) : undefined), [id]);
  const previousSnapshot = useLiveQuery(
    () => (runtime?.formationSnapshotId ? db.formationSnapshots.get(runtime.formationSnapshotId) : undefined),
    [runtime?.formationSnapshotId],
  );
  const settings = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const presets = useLiveQuery(() => db.formationPresets.toArray(), []);

  const [step, setStep] = useState(1);
  const [onFieldIds, setOnFieldIds] = useState<string[]>([]);
  const [formation, setFormation] = useState<FormationType>("2-2-1");
  const [slots, setSlots] = useState<LineupSlot[]>([]);
  const [pairs, setPairs] = useState<SubstitutionPair[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const squad = useMemo(
    () => assignments
      .map((item) => players.find((player) => player.id === item.playerId))
      .filter((player): player is Player => Boolean(player))
      .sort((a, b) => a.number - b.number),
    [assignments, players],
  );
  const onFieldPlayers = squad.filter((player) => onFieldIds.includes(player.id));
  const bench = squad.filter((player) => !onFieldIds.includes(player.id));
  const previousOnField = runtime?.onFieldPlayerIds?.length
    ? runtime.onFieldPlayerIds
    : assignments.filter((item) => item.onField).map((item) => item.playerId);
  const derived = deriveLineupChanges(previousOnField, onFieldIds);
  const goalkeeperId = slots.find((slot) => slot.role === "GK")?.playerId ?? "";
  const runtimeValid = validateRuntimeState({
    squadPlayerIds: squad.map((player) => player.id),
    onFieldPlayerIds: onFieldIds,
    goalkeeperId,
  });
  const formationValid = validateLineup(formation, slots, squad.map((player) => player.id));
  const canStart = runtimeValid.ok && formationValid.ok;

  useEffect(() => {
    if (!id || ready || squad.length === 0 || presets === undefined) {
      return;
    }
    if (runtime?.formationSnapshotId && previousSnapshot === undefined) {
      return;
    }
    if (previousOnField.length === 0 && !draft) {
      return;
    }
    const secondPreset = presets.find((preset) => preset.half === 2) ?? defaultSecondHalfPreset(0);
    const presetSlots = presetService.slotsForPlayers(secondPreset, squad);
    const initial = resolveHalftimeInitialLineup({
      draft,
      previousOnField,
      previousSlots: previousSnapshot?.slots ?? [],
      previousGk: runtime?.goalkeeperId ?? "",
      presetFormation: secondPreset.formation,
      presetSlots,
    });
    setOnFieldIds(initial.onFieldIds);
    setFormation(initial.formation);
    setSlots(initial.slots);
    setPairs(deriveLineupChanges(previousOnField, initial.onFieldIds).pairs);
    setReady(true);
  }, [draft, id, previousOnField, previousSnapshot, presets, ready, runtime, squad]);

  useEffect(() => {
    if (!id || !ready || onFieldIds.length === 0) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void lineupService.saveDraft({
        matchId: id,
        purpose: "HALF_TIME",
        formation,
        slots,
        onFieldPlayerIds: onFieldIds,
        goalkeeperId,
        updatedAt: Date.now(),
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [formation, goalkeeperId, id, onFieldIds, ready, slots]);

  if (!id || match === undefined) {
    return <p>Opening half-time setup from this iPad…</p>;
  }
  if (!match) {
    return <p>That match is not stored on this device.</p>;
  }
  if (match.phase === "FULL_TIME") {
    navigate(`/match/${id}/report`, { replace: true });
    return null;
  }

  function togglePlayer(playerId: string) {
    setOnFieldIds((current) => {
      const next = current.includes(playerId)
        ? current.filter((item) => item !== playerId)
        : current.length >= MATCH_ON_FIELD_SIZE
          ? current
          : [...current, playerId];
      setPairs(deriveLineupChanges(previousOnField, next).pairs);
      setSlots(remapSlotsToFormation(slots, formation, next, slots.find((slot) => slot.role === "GK" && next.includes(slot.playerId))?.playerId ?? ""));
      return next;
    });
  }

  const review = reviewLineupChange(
    previousSnapshot ? { formation: previousSnapshot.formation, slots: previousSnapshot.slots } : null,
    { formation, slots },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide">Half time</p>
        <h1 className="text-3xl font-bold">Second-half setup</h1>
        <p className="mt-2 text-lg font-semibold">First half complete.</p>
        <p className="mt-2 text-xl font-semibold">
          {settings?.teamName ?? "Tyloo FC"} vs {match.opponent}
        </p>
      </div>
      {error ? <p className="font-semibold text-danger" role="alert">{error}</p> : null}

      {step === 1 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Second-half players</h2>
          <p>Select exactly 6. The other two sit on the bench.</p>
          <p className="font-bold">{onFieldIds.length} / {MATCH_ON_FIELD_SIZE}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {squad.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                selected={onFieldIds.includes(player.id)}
                isGoalkeeper={player.id === goalkeeperId}
                onSelect={() => togglePlayer(player.id)}
              />
            ))}
          </div>
          <section className="rounded-lg border-2 border-border bg-surface p-4">
            <h3 className="text-lg font-bold uppercase tracking-wide">Bench</h3>
            <p className="mt-2 text-lg font-semibold">
              {bench.length === 0 ? "Select six players to see the bench." : bench.map((player) => playerShirtLabel(player)).join(" · ")}
            </p>
          </section>
          <Button variant="primary" disabled={onFieldIds.length !== MATCH_ON_FIELD_SIZE} onClick={() => setStep(2)}>
            Continue to formation
          </Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Second-half formation</h2>
          <LineupEditor
            formation={formation}
            slots={slots}
            onField={onFieldPlayers}
            onChange={(nextFormation, nextSlots) => {
              setFormation(nextFormation);
              setSlots(nextSlots);
            }}
          />
          <div className="flex gap-3">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" disabled={!formationValid.ok} onClick={() => setStep(3)}>
              Continue to review
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-col gap-5">
          <h2 className="text-2xl font-bold">Second half review</h2>
          <article className="rounded-lg border-2 border-border bg-surface p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide">Formation</h3>
            <p className="mt-1 text-2xl font-bold">{formation}</p>
            <LineupRoleList slots={slots} players={squad} />
            <h3 className="mt-4 text-sm font-bold uppercase tracking-wide">Bench</h3>
            <p className="mt-1 text-lg font-semibold">{bench.map((player) => playerShirtLabel(player)).join(" · ")}</p>
          </article>
          <article className="rounded-lg border-2 border-border bg-surface p-4">
            <h3 className="text-lg font-bold uppercase tracking-wide">Changes from first half</h3>
            <p className="mt-2 font-semibold">
              Formation {review.previousFormation ?? "—"} → {review.newFormation}
            </p>
            <p className="font-semibold">
              Goalkeeper {nameOf(review.previousGoalkeeperId, squad)} → {nameOf(review.newGoalkeeperId, squad)}
            </p>
            {review.roleChanges.length > 0 ? (
              <ul className="mt-2">
                {review.roleChanges.map((change) => (
                  <li key={change.playerId} className="font-semibold">
                    {nameOf(change.playerId, squad)}: {change.previousRole ?? "—"} → {change.newRole}
                  </li>
                ))}
              </ul>
            ) : null}
            <h4 className="mt-3 text-sm font-bold uppercase tracking-wide">Substitutions</h4>
            {(pairs.length === derived.pairs.length ? pairs : derived.pairs).length === 0 ? (
              <p className="mt-1 font-semibold">None</p>
            ) : (
              <ul className="mt-1">
                {(pairs.length === derived.pairs.length ? pairs : derived.pairs).map((pair, index) => (
                  <li key={`${pair.playerOffId}-${pair.playerOnId}`} className="flex flex-wrap items-center gap-3 font-semibold">
                    <span>{nameOf(pair.playerOffId, squad)} OFF</span>
                    <span aria-hidden="true">→</span>
                    <span>{nameOf(pair.playerOnId, squad)} ON</span>
                    {derived.entering.length > 1 ? (
                      <Button
                        onClick={() => {
                          const currentPairs = pairs.length === derived.pairs.length ? pairs : derived.pairs;
                          const nextOn = derived.entering[(derived.entering.indexOf(pair.playerOnId) + 1) % derived.entering.length];
                          if (nextOn) {
                            setPairs(swapPairOnPlayer(currentPairs, index, nextOn));
                          }
                        }}
                      >
                        Swap pairing
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </article>
          {!canStart ? (
            <p className="font-semibold" role="status">
              {formationValid.ok ? runtimeValid.ok ? "Finish the second-half lineup before starting." : runtimeValid.errors[0] : formationValid.errors[0]}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button
              variant="primary"
              disabled={!canStart}
              onClick={() => {
                void (async () => {
                  try {
                    await lifecycleService.startSecondHalf({
                      matchId: match.id,
                      formation,
                      slots,
                      pairs: pairs.length === derived.pairs.length ? pairs : derived.pairs,
                    });
                    navigate(`/match/${match.id}/live`);
                  } catch (err) {
                    setError(err instanceof LocalWriteError ? err.message : "The second half was not written to this iPad.");
                  }
                })();
              }}
            >
              Start second half
            </Button>
          </div>
        </section>
      ) : null}

      <Link to={`/match/${match.id}/summary/1`} className="font-semibold underline">
        Back to first-half summary
      </Link>
    </div>
  );
}

function nameOf(playerId: string, squad: Player[]): string {
  const player = squad.find((item) => item.id === playerId);
  return player ? playerShirtLabel(player) : "—";
}
