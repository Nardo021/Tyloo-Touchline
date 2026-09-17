import {
  applySubstitutionToSquad,
  createId,
  displayedElapsedMs,
  EVENT_LABELS,
  revertSubstitutionOnSquad,
  type EventType,
  type MatchEvent,
  type PlayerEventType,
} from "@tyloo/shared";
import { db } from "../../db/database";
import { getDeviceId } from "../../lib/device";
import { toLocalWriteError } from "../../lib/localWrite";

export interface RecordPlayerInput {
  matchId: string;
  playerId: string;
  type: PlayerEventType;
  assistPlayerId?: string | null;
}

export class EventService {
  async recordPlayerEvent(input: RecordPlayerInput): Promise<MatchEvent> {
    const event = await this.buildBase(input.matchId, input.type);
    const complete = completePlayerEvent(event, input);
    await this.commit(complete);
    return complete;
  }

  async recordTeamEvent(matchId: string, type: "CORNER_FOR" | "CORNER_AGAINST" | "GOAL_AGAINST"): Promise<MatchEvent> {
    const event = await this.buildBase(matchId, type);
    const complete: MatchEvent = { ...event, type, playerId: null };
    await this.commit(complete);
    return complete;
  }

  async recordSubstitution(matchId: string, playerOffId: string, playerOnId: string): Promise<MatchEvent> {
    const event = await this.buildBase(matchId, "SUBSTITUTION");
    const complete: MatchEvent = {
      ...event,
      type: "SUBSTITUTION",
      playerId: null,
      playerOffId,
      playerOnId,
    };
    const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
    const next = applySubstitutionToSquad(roster, playerOffId, playerOnId, complete.createdAt);
    try {
      await db.transaction("rw", db.events, db.matchPlayers, async () => {
        await db.events.put(complete);
        await db.matchPlayers.bulkPut(next);
      });
    } catch (error) {
      throw toLocalWriteError(error, "The substitution was not written to this iPad.");
    }
    return complete;
  }

  async voidEvent(eventId: string): Promise<MatchEvent | null> {
    const event = await db.events.get(eventId);
    if (!event || event.status === "VOIDED") {
      return event ?? null;
    }
    const updated: MatchEvent = { ...event, status: "VOIDED", updatedAt: Date.now() };
    try {
      await db.transaction("rw", db.events, db.matchPlayers, async () => {
        await db.events.put(updated);
        if (event.type === "SUBSTITUTION") {
          const roster = await db.matchPlayers.where("matchId").equals(event.matchId).toArray();
          const next = revertSubstitutionOnSquad(roster, event.playerOffId, event.playerOnId, updated.updatedAt);
          await db.matchPlayers.bulkPut(next);
        }
      });
    } catch (error) {
      throw toLocalWriteError(error, "The event could not be voided on this iPad.");
    }
    return updated;
  }

  async listRecent(matchId: string, limit = 5): Promise<MatchEvent[]> {
    const events = await db.events.where("matchId").equals(matchId).reverse().sortBy("createdAt");
    return events.filter((event) => event.status === "ACTIVE").slice(0, limit);
  }

  async listAll(matchId: string): Promise<MatchEvent[]> {
    return db.events.where("matchId").equals(matchId).sortBy("createdAt");
  }

  describe(event: MatchEvent, playerName: (id: string | null) => string): string {
    if (event.type === "GOAL") {
      const assist = event.assistPlayerId ? `, assist ${playerName(event.assistPlayerId)}` : "";
      return `${EVENT_LABELS.GOAL} — ${playerName(event.playerId)}${assist}`;
    }
    if (event.type === "SUBSTITUTION") {
      return `SUB — ${playerName(event.playerOnId)} ON / ${playerName(event.playerOffId)} OFF`;
    }
    const player = "playerId" in event ? playerName(event.playerId) : "";
    return player ? `${EVENT_LABELS[event.type]} — ${player}` : EVENT_LABELS[event.type];
  }

  private async buildBase(matchId: string, type: EventType) {
    const match = await db.matches.get(matchId);
    if (!match) {
      throw toLocalWriteError(new Error("missing"), "That match is no longer on this device.");
    }
    const now = Date.now();
    return {
      id: createId(),
      matchId,
      type,
      period: match.clock.period,
      matchTimeMs: displayedElapsedMs(match.clock, now),
      createdAt: now,
      updatedAt: now,
      deviceId: await getDeviceId(),
      status: "ACTIVE" as const,
    };
  }

  private async commit(event: MatchEvent): Promise<void> {
    try {
      await db.events.put(event);
      const stored = await db.events.get(event.id);
      if (!stored) {
        throw new Error("missing-write");
      }
    } catch (error) {
      throw toLocalWriteError(error, "The event was not written to this iPad.");
    }
  }
}

function completePlayerEvent(
  base: Awaited<ReturnType<EventService["buildBase"]>>,
  input: RecordPlayerInput,
): MatchEvent {
  switch (input.type) {
    case "GOAL":
      return { ...base, type: "GOAL", playerId: input.playerId, assistPlayerId: input.assistPlayerId ?? null };
    case "ASSIST":
    case "SHOT":
    case "SHOT_ON_TARGET":
    case "KEY_DEFENCE":
    case "INTERCEPTION":
    case "FOUL":
    case "FOUL_WON":
    case "OFFSIDE":
    case "SAVE":
    case "YELLOW_CARD":
    case "RED_CARD":
    case "OWN_GOAL":
      return { ...base, type: input.type, playerId: input.playerId };
    default: {
      const _exhaustive: never = input.type;
      return _exhaustive;
    }
  }
}

export const eventService = new EventService();
