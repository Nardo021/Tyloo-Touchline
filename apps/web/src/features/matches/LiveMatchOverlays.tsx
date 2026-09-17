import type { FormationType, LineupSlot, Player, PlayerEventType } from "@tyloo/shared";
import { ChangeGoalkeeperView } from "./ChangeGoalkeeperView";
import { ChangeLineupView } from "./ChangeLineupView";
import { PlayerEventView } from "./PlayerEventView";
import { SubstitutionView } from "./SubstitutionView";

export type LiveOverlay = "none" | "player" | "sub" | "gk" | "corner" | "lineup";

export function LiveMatchOverlays({
  overlay,
  selectedPlayer,
  onField,
  bench,
  goalkeeperId,
  matchTimeMs,
  editFormation,
  editSlots,
  snapshotSlots,
  onCancel,
  onChangeLineup,
  onSavePlayerEvent,
  onSaveSubstitution,
  onSaveGoalkeeper,
  onSaveLineup,
}: {
  overlay: LiveOverlay;
  selectedPlayer: Player | null;
  onField: Player[];
  bench: Player[];
  goalkeeperId: string | null;
  matchTimeMs: number;
  editFormation: FormationType;
  editSlots: LineupSlot[];
  snapshotSlots?: LineupSlot[];
  onCancel: () => void;
  onChangeLineup: (formation: FormationType, slots: LineupSlot[]) => void;
  onSavePlayerEvent: (type: PlayerEventType, assistPlayerId: string | null) => void;
  onSaveSubstitution: (
    playerOffId: string,
    playerOnId: string,
    nextGoalkeeperId?: string,
    nextSlots?: LineupSlot[],
  ) => void;
  onSaveGoalkeeper: (newGoalkeeperId: string) => void;
  onSaveLineup: () => void;
}) {
  if (overlay === "none" || overlay === "corner") {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background">
      {overlay === "player" && selectedPlayer ? (
        <PlayerEventView
          player={selectedPlayer}
          teammates={onField}
          isGoalkeeper={selectedPlayer.id === goalkeeperId}
          onCancel={onCancel}
          onSave={onSavePlayerEvent}
        />
      ) : null}
      {overlay === "sub" ? (
        <SubstitutionView
          onField={onField}
          bench={bench}
          goalkeeperId={goalkeeperId}
          matchTimeMs={matchTimeMs}
          onCancel={onCancel}
          slots={snapshotSlots}
          onSave={onSaveSubstitution}
        />
      ) : null}
      {overlay === "gk" ? (
        <ChangeGoalkeeperView
          onField={onField}
          goalkeeperId={goalkeeperId}
          onCancel={onCancel}
          onSave={onSaveGoalkeeper}
        />
      ) : null}
      {overlay === "lineup" ? (
        <ChangeLineupView
          formation={editFormation}
          slots={editSlots}
          onField={onField}
          onChange={onChangeLineup}
          onCancel={onCancel}
          onSave={onSaveLineup}
        />
      ) : null}
    </div>
  );
}
