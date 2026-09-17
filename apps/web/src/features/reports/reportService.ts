import { deriveMatchReport, type MatchReport } from "@tyloo/shared";
import { db } from "../../db/database";

export async function buildMatchReport(matchId: string): Promise<MatchReport> {
  const events = await db.events.where("matchId").equals(matchId).toArray();
  const roster = await db.matchPlayers.where("matchId").equals(matchId).toArray();
  return deriveMatchReport(events, roster.map((item) => item.playerId));
}
