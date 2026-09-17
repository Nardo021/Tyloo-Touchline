import { createId, DEFAULT_TEAM_ID, type Player } from "@tyloo/shared";
import { db } from "../../db/database";
import { toLocalWriteError } from "../../lib/localWrite";

export class PlayerService {
  async listActive(): Promise<Player[]> {
    const players = await db.players.toArray();
    return players.filter((player) => player.active).sort((a, b) => a.number - b.number);
  }

  async listAll(): Promise<Player[]> {
    const players = await db.players.toArray();
    return players.sort((a, b) => a.number - b.number);
  }

  async save(input: { id?: string; number: number; name: string; position: string | null; active: boolean }): Promise<Player> {
    const now = Date.now();
    const existing = input.id ? await db.players.get(input.id) : undefined;
    const player: Player = {
      id: existing?.id ?? createId(),
      teamId: existing?.teamId ?? DEFAULT_TEAM_ID,
      number: input.number,
      name: input.name.trim(),
      position: input.position?.trim() || null,
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

  nameMap(players: Player[]): Map<string, string> {
    return new Map(players.map((player) => [player.id, player.name]));
  }
}

export const playerService = new PlayerService();
