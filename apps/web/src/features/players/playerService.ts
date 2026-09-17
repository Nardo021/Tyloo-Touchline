import { createId, DEFAULT_TEAM_ID, resolveMatchPhase, type Player } from "@tyloo/shared";
import { db } from "../../db/database";
import { LocalWriteError, toLocalWriteError } from "../../lib/localWrite";

export class PlayerService {
  async listActive(): Promise<Player[]> {
    const players = await db.players.toArray();
    return players.filter((player) => player.active).sort((a, b) => a.number - b.number);
  }

  async listAll(): Promise<Player[]> {
    const players = await db.players.toArray();
    return players.sort((a, b) => a.number - b.number);
  }

  async save(input: { id?: string; number: number; name: string; position?: string | null; active: boolean }): Promise<Player> {
    const now = Date.now();
    const existing = input.id ? await db.players.get(input.id) : undefined;
    const player: Player = {
      id: existing?.id ?? createId(),
      teamId: existing?.teamId ?? DEFAULT_TEAM_ID,
      number: input.number,
      name: input.name.trim(),
      position: input.position?.trim() || existing?.position || null,
      active: input.active,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await db.players.put(player);
    } catch (error) {
      throw toLocalWriteError(error, "The player was not written to this iPad.");
    }
    return player;
  }

  async byId(id: string): Promise<Player | undefined> {
    return db.players.get(id);
  }

  async remove(id: string): Promise<void> {
    const existing = await db.players.get(id);
    if (!existing) {
      throw new LocalWriteError("That player is no longer on this iPad.", false);
    }
    if (existing.active) {
      throw new LocalWriteError("Deactivate the player before deleting.", false);
    }

    const assignments = await db.matchPlayers.where("playerId").equals(id).toArray();
    if (assignments.length > 0) {
      const matchIds = [...new Set(assignments.map((item) => item.matchId))];
      const matches = await db.matches.bulkGet(matchIds);
      const inUnfinishedMatch = matches.some(
        (match) => match && resolveMatchPhase(match) !== "FULL_TIME" && match.status !== "FINISHED",
      );
      if (inUnfinishedMatch) {
        throw new LocalWriteError("This player is still in an unfinished match.", false);
      }
    }

    try {
      await db.players.delete(id);
    } catch (error) {
      throw toLocalWriteError(error, "The player was not deleted from this iPad.");
    }
  }

  nameMap(players: Player[]): Map<string, string> {
    return new Map(players.map((player) => [player.id, player.name]));
  }
}

export const playerService = new PlayerService();
