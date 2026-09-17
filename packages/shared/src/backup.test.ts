import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION } from "./constants.js";
import { parseTouchlineBackupJson, summarizeBackup, validateTouchlineBackup } from "./backup.js";
import { DEFAULT_TEAM_ID } from "./ids.js";

function validBackup() {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-09-17T00:00:00.000Z",
    appVersion: "3.0.0",
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
      matchRuntimeStates: [],
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

  it("migrates a version 1 backup and derives runtime snapshots", () => {
    const legacy = validBackup();
    legacy.version = 1;
    delete (legacy.data as { matchRuntimeStates?: unknown }).matchRuntimeStates;
    legacy.data.matches = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        teamId: DEFAULT_TEAM_ID,
        opponent: "Northside",
        competition: "NSFA Summer",
        date: "2026-09-17",
        status: "FINISHED",
        periodCount: 2,
        periodLengthMs: 1_200_000,
        currentPeriod: 2,
        clock: { running: false, accumulatedMs: 1000, lastStartedAt: null, period: 2, phase: "FINISHED" },
        createdAt: 1,
        updatedAt: 1,
        startedAt: 1,
        finishedAt: 2,
      },
    ];
    legacy.data.matchPlayers = [
      {
        matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        playerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        starter: true,
        onField: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const result = validateTouchlineBackup(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.version).toBe(BACKUP_VERSION);
      expect(result.backup.data.matchRuntimeStates[0]?.onFieldPlayerIds).toEqual([
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ]);
    }
  });

  it("maps CUSTOM formations to 2-1-2 and fills snapshot status", () => {
    const backup = validBackup();
    backup.data.matches = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        teamId: DEFAULT_TEAM_ID,
        opponent: "Northside",
        competition: "NSFA Summer",
        date: "2026-09-17",
        status: "FINISHED",
        startingFormation: "CUSTOM",
        periodCount: 2,
        periodLengthMs: 1_200_000,
        currentPeriod: 2,
        clock: { running: false, accumulatedMs: 1000, lastStartedAt: null, period: 2, phase: "FINISHED" },
        createdAt: 1,
        updatedAt: 1,
        startedAt: 1,
        finishedAt: 2,
      },
    ];
    (backup.data as { formationSnapshots: unknown[] }).formationSnapshots = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        period: 1,
        formation: "CUSTOM",
        effectiveMatchTimeMs: 0,
        slots: [],
        createdAt: 1,
      },
    ];
    const result = validateTouchlineBackup(backup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.data.matches[0]?.startingFormation).toBe("2-1-2");
      expect(result.backup.data.matches[0]?.phase).toBe("FULL_TIME");
      expect(result.backup.data.matches[0]?.clockMode).toBe("cumulative");
      expect(result.backup.data.formationSnapshots[0]?.formation).toBe("2-1-2");
      expect(result.backup.data.formationSnapshots[0]?.status).toBe("ACTIVE");
    }
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
