import {
  applyDefaultFirstHalfPreset,
  applyDefaultSecondHalfPreset,
  defaultFirstHalfPreset,
  defaultSecondHalfPreset,
  normalizeFormationType,
  slotsForFormation,
  type FormationPreset,
  type FormationType,
  type LineupSlot,
  type Player,
} from "@tyloo/shared";
import { db } from "../../db/database";
import { toLocalWriteError } from "../../lib/localWrite";

export class PresetService {
  async list(): Promise<FormationPreset[]> {
    const stored = await db.formationPresets.toArray();
    return stored.sort((left, right) => left.half - right.half);
  }

  async ensureSeeded(): Promise<void> {
    const stored = await db.formationPresets.toArray();
    if (stored.length > 0) {
      return;
    }
    const now = Date.now();
    try {
      await db.formationPresets.bulkPut([defaultFirstHalfPreset(now), defaultSecondHalfPreset(now)]);
    } catch (error) {
      throw toLocalWriteError(error, "The lineup presets were not written to this iPad.");
    }
  }

  async getForHalf(half: 1 | 2): Promise<FormationPreset> {
    await this.ensureSeeded();
    const presets = await this.list();
    const found = presets.find((preset) => preset.half === half);
    return found ?? (half === 1 ? defaultFirstHalfPreset(Date.now()) : defaultSecondHalfPreset(Date.now()));
  }

  async save(preset: FormationPreset): Promise<void> {
    try {
      await db.formationPresets.put({ ...preset, updatedAt: Date.now() });
    } catch (error) {
      throw toLocalWriteError(error, "The lineup preset was not written to this iPad.");
    }
  }

  slotsForPlayers(preset: FormationPreset, players: Player[]): LineupSlot[] {
    const byId = new Map(players.map((player) => [player.id, player]));
    const byNumber = new Map(players.map((player) => [player.number, player]));
    return slotsForFormation(normalizeFormationType(String(preset.formation))).map((definition) => {
      const stored = preset.slots.find((slot) => slot.slotId === definition.slotId);
      const fromId = stored?.playerId ? byId.get(stored.playerId) : undefined;
      const fromNumber = stored?.playerNumber != null ? byNumber.get(stored.playerNumber) : undefined;
      const player = fromId ?? fromNumber;
      return {
        slotId: definition.slotId,
        role: definition.role,
        playerId: player?.id ?? "",
        order: definition.order,
      };
    });
  }

  defaultSlots(half: 1 | 2, players: Array<{ id: string; number: number }>): {
    formation: FormationType;
    slots: LineupSlot[];
  } {
    const preset = half === 1 ? applyDefaultFirstHalfPreset(players) : applyDefaultSecondHalfPreset(players);
    return { formation: preset.formation, slots: preset.slots };
  }
}

export const presetService = new PresetService();
