import {
  DEFAULT_PERIOD_COUNT,
  DEFAULT_PERIOD_LENGTH_MS,
  DEFAULT_TEAM_ID,
  isCompletePreset,
  type FormationPreset,
  type TouchlineBackup,
} from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Field";
import { db, defaultAppSettings, getAppSettings, SETTING_KEYS, setSetting } from "../db/database";
import { backupService, daysSince, downloadTextFile, type BackupSummary } from "../features/backup/backupService";
import { LineupEditor } from "../features/matches/LineupEditor";
import { presetService } from "../features/presets/presetService";
import { storageService, type StorageEstimateInfo } from "../features/storage/storageService";
import { APP_VERSION } from "../lib/appVersion";
import { getDeviceName, setDeviceName } from "../lib/device";
import { LocalWriteError } from "../lib/localWrite";

export function SettingsPage() {
  const stored = useLiveQuery(() => getAppSettings(), []);
  const lastBackupAt = useLiveQuery(() => backupService.lastFullBackupAt(), []);
  const [teamName, setTeamName] = useState(stored?.teamName ?? "Tyloo FC");
  const [periodCount, setPeriodCount] = useState(stored?.defaultPeriodCount ?? DEFAULT_PERIOD_COUNT);
  const [minutes, setMinutes] = useState(
    Math.round((stored?.defaultPeriodLengthMs ?? DEFAULT_PERIOD_LENGTH_MS) / 60000),
  );
  const [device, setDevice] = useState("Match iPad");
  const [keepAwake, setKeepAwake] = useState(stored?.keepAwake ?? true);
  const [saved, setSaved] = useState(false);
  const [storage, setStorage] = useState<StorageEstimateInfo | null>(null);
  const [persistState, setPersistState] = useState<string>("");
  const [backupError, setBackupError] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<{ backup: TouchlineBackup; summary: BackupSummary } | null>(null);
  const [editingPreset, setEditingPreset] = useState<FormationPreset | null>(null);
  const [presetSaved, setPresetSaved] = useState(false);
  const players = useLiveQuery(async () => {
    const all = await db.players.toArray();
    return all.filter((player) => player.active).sort((a, b) => a.number - b.number);
  }, []) ?? [];
  const presets = (useLiveQuery(() => db.formationPresets.toArray(), []) ?? [])
    .slice()
    .sort((left, right) => left.half - right.half);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void presetService.ensureSeeded();
  }, []);

  useLiveQuery(async () => {
    const name = await getDeviceName();
    setDevice(name);
    if (stored) {
      setTeamName(stored.teamName);
      setPeriodCount(stored.defaultPeriodCount);
      setMinutes(Math.round(stored.defaultPeriodLengthMs / 60000));
      setKeepAwake(stored.keepAwake ?? true);
    }
    const estimate = await storageService.estimate();
    setStorage(estimate);
    return name;
  }, [stored]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...defaultAppSettings(),
      ...stored,
      teamName: teamName.trim() || "Tyloo FC",
      logoDataUrl: stored?.logoDataUrl ?? null,
      defaultPeriodCount: periodCount,
      defaultPeriodLengthMs: minutes * 60 * 1000,
      deviceName: device.trim() || "Match iPad",
      firstUseHelpSeen: stored?.firstUseHelpSeen ?? true,
      keepAwake,
      updatedAt: Date.now(),
    };
    await setSetting(SETTING_KEYS.appSettings, next);
    await setDeviceName(next.deviceName);
    const team = await db.teams.get(DEFAULT_TEAM_ID);
    const now = Date.now();
    await db.teams.put({
      id: DEFAULT_TEAM_ID,
      name: next.teamName,
      logoDataUrl: next.logoDataUrl,
      createdAt: team?.createdAt ?? now,
      updatedAt: now,
    });
    setSaved(true);
  }

  async function exportBackup() {
    const { filename, json } = await backupService.exportAll();
    downloadTextFile(filename, json, "application/json");
  }

  async function onPickBackup(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    const result = backupService.inspect(text);
    if (!result.ok) {
      switch (result.reason) {
        case "not-json":
          setBackupError("That file is not valid JSON.");
          return;
        case "invalid-format":
          setBackupError("That file is not a Touchline backup.");
          return;
        case "unsupported-version":
          setBackupError("That backup version is not supported on this iPad.");
          return;
        case "malformed":
          setBackupError(result.message);
          return;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    }
    setBackupError(null);
    setPendingBackup({ backup: result.backup, summary: result.summary });
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSave(event)}>
        <h1 className="text-3xl font-bold">Settings</h1>
        <Field label="Team name" htmlFor="team">
          <Input id="team" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
        </Field>
        <Field label="Default periods" htmlFor="periods">
          <Input
            id="periods"
            inputMode="numeric"
            value={periodCount}
            onChange={(event) => setPeriodCount(Number(event.target.value) || 2)}
          />
        </Field>
        <Field label="Default period length (minutes)" htmlFor="minutes">
          <Input
            id="minutes"
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value) || 20)}
          />
        </Field>
        <Field label="This iPad name" htmlFor="device">
          <Input id="device" value={device} onChange={(event) => setDevice(event.target.value)} />
        </Field>
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            checked={keepAwake}
            onChange={(event) => setKeepAwake(event.target.checked)}
          />
          Keep screen awake during a running match
        </label>
        <Button variant="primary" type="submit">
          Save settings
        </Button>
        {saved ? <p role="status">Settings saved on this iPad.</p> : null}
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Lineup presets</h2>
        <p>These are starting suggestions only. Any player can play any role in a match.</p>
        {presets.map((preset) => (
          <article key={preset.id} className="rounded-lg border-2 border-border bg-surface p-4">
            <h3 className="text-xl font-bold">{preset.half === 1 ? "First half" : "Second half"}</h3>
            <p className="mt-1 font-semibold">{preset.formation}</p>
            <p className="text-text-muted">{isCompletePreset(preset) ? "Complete" : "Forward not configured yet"}</p>
            <Button className="mt-3" onClick={() => setEditingPreset(preset)}>
              Edit preset
            </Button>
          </article>
        ))}
        {editingPreset ? (
          <div className="rounded-lg border-2 border-primary bg-surface p-4">
            <h3 className="text-xl font-bold">Edit {editingPreset.half === 1 ? "first-half" : "second-half"} preset</h3>
            <LineupEditor
              formation={editingPreset.formation}
              slots={presetService.slotsForPlayers(editingPreset, players)}
              onField={players.filter((player) => presetService.slotsForPlayers(editingPreset, players).some((slot) => slot.playerId === player.id))}
              candidates={players}
              onChange={(formation, slots) => {
                setEditingPreset({
                  ...editingPreset,
                  formation,
                  slots: slots.map((slot) => ({
                    slotId: slot.slotId,
                    role: slot.role,
                    order: slot.order,
                    playerId: slot.playerId || null,
                    playerNumber: players.find((player) => player.id === slot.playerId)?.number ?? null,
                  })),
                });
              }}
            />
            <div className="mt-3 flex gap-3">
              <Button onClick={() => setEditingPreset(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void presetService.save(editingPreset).then(() => {
                    setPresetSaved(true);
                    setEditingPreset(null);
                  });
                }}
              >
                Save preset
              </Button>
            </div>
          </div>
        ) : null}
        {presetSaved ? <p role="status">Lineup preset saved on this iPad.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Data</h2>
        <p>There is no cloud copy. Export a backup after important matches.</p>
        <p className="font-semibold">
          Last full backup:{" "}
          {lastBackupAt
            ? daysSince(lastBackupAt) === 0
              ? "today"
              : daysSince(lastBackupAt) === 1
                ? "1 day ago"
                : `${daysSince(lastBackupAt)} days ago`
            : "never"}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void exportBackup()}>
            Export backup
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import backup</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            void onPickBackup(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {backupError ? <p className="font-semibold text-danger" role="alert">{backupError}</p> : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">Storage</h2>
        <p>
          Used: {formatBytes(storage?.usage)} / {formatBytes(storage?.quota)}
        </p>
        <Button
          onClick={async () => {
            const state = await storageService.persist();
            setPersistState(state);
          }}
        >
          Request persistent storage
        </Button>
        {persistState ? <p role="status">Persistent storage: {persistState}</p> : null}
      </section>

      <section>
        <h2 className="text-2xl font-bold">About</h2>
        <p className="mt-2 font-semibold">Touchline {APP_VERSION}</p>
        <p className="text-text-muted">Standalone iPad app. Cloudflare Pages only distributes new versions.</p>
      </section>

      <Dialog
        open={Boolean(pendingBackup)}
        title="Replace all local data?"
        onClose={() => setPendingBackup(null)}
      >
        {pendingBackup ? (
          <div className="flex flex-col gap-3">
            <p>This will replace every team, player, match, and event on this iPad.</p>
            <ul className="font-semibold">
              <li>{pendingBackup.summary.teams} teams</li>
              <li>{pendingBackup.summary.players} players</li>
              <li>{pendingBackup.summary.matches} matches</li>
              <li>{pendingBackup.summary.events} events</li>
            </ul>
            <div className="flex gap-3">
              <Button onClick={() => setPendingBackup(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await backupService.restore(pendingBackup.backup);
                    setPendingBackup(null);
                  } catch (error) {
                    setBackupError(error instanceof LocalWriteError ? error.message : "Restore failed.");
                    setPendingBackup(null);
                  }
                }}
              >
                Replace local data
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function formatBytes(value: number | null | undefined): string {
  if (value == null) {
    return "unknown";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const mb = value / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
