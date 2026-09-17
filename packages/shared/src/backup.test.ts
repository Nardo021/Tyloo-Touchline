import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION } from "./constants.js";
import { parseTouchlineBackupJson, summarizeBackup, validateTouchlineBackup } from "./backup.js";
import { DEFAULT_TEAM_ID } from "./ids.js";

function validBackup() {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-09-17T00:00:00.000Z",
    appVersion: "1.0.0",
    data: {
      settings: {
        teamName: "Tyloo FC",
        logoDataUrl: null,
        defaultPeriodCount: 2,
        defaultPeriodLengthMs: 1_200_000,
        deviceName: "Match iPad",
        firstUseHelpSeen: true,
        keepAwake: true,
        updatedAt: 1,
      },
      teams: [
        {
          id: DEFAULT_TEAM_ID,
          name: "Tyloo FC",
          logoDataUrl: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      players: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          teamId: DEFAULT_TEAM_ID,
          number: 11,
          name: "Leo",
          position: "FWD",
          active: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      matches: [],
      matchPlayers: [],
      events: [],
      clockStates: [],
    },
  };
}

describe("Touchline backup validation", () => {
  it("accepts a versioned backup and summarises it", () => {
    const result = validateTouchlineBackup(validBackup());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(summarizeBackup(result.backup)).toEqual({
        teams: 1,
        players: 1,
        matches: 0,
        events: 0,
      });
    }
  });

  it("rejects a backup with the wrong format name", () => {
    const result = validateTouchlineBackup({ ...validBackup(), format: "other-backup" });
    expect(result).toEqual({ ok: false, reason: "invalid-format" });
  });

  it("rejects an unsupported backup version", () => {
    const result = validateTouchlineBackup({ ...validBackup(), version: 99 });
    expect(result).toMatchObject({ ok: false, reason: "unsupported-version", version: 99 });
  });

  it("rejects malformed JSON text", () => {
    expect(parseTouchlineBackupJson("{not json")).toEqual({ ok: false, reason: "not-json" });
  });

  it("rejects a backup missing required collections", () => {
    const broken = validBackup();
    delete (broken.data as { players?: unknown }).players;
    const result = validateTouchlineBackup(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed");
    }
  });
});
