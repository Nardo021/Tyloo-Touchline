import { DEFAULT_PERIOD_COUNT, DEFAULT_PERIOD_LENGTH_MS } from "@tyloo/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { defaultAppSettings, getSetting, SETTING_KEYS, setSetting } from "../db/database";
import { createId } from "@tyloo/shared";
import { enqueueMutation } from "../features/sync/syncQueue";
import { requestSync } from "../features/sync/syncService";
import { apiPost } from "../lib/api";
import { getDeviceName, setDeviceName } from "../lib/device";
import { clearLocalSession } from "../lib/session";

export function SettingsPage() {
  const navigate = useNavigate();
  const stored = useLiveQuery(() => getSetting(SETTING_KEYS.appSettings, defaultAppSettings()), []);
  const [teamName, setTeamName] = useState(stored?.teamName ?? "Tyloo FC");
  const [periodCount, setPeriodCount] = useState(stored?.defaultPeriodCount ?? DEFAULT_PERIOD_COUNT);
  const [minutes, setMinutes] = useState(
    Math.round((stored?.defaultPeriodLengthMs ?? DEFAULT_PERIOD_LENGTH_MS) / 60000),
  );
  const [device, setDevice] = useState("Match iPad");
  const [saved, setSaved] = useState(false);

  useLiveQuery(async () => {
    const name = await getDeviceName();
    setDevice(name);
    if (stored) {
      setTeamName(stored.teamName);
      setPeriodCount(stored.defaultPeriodCount);
      setMinutes(Math.round(stored.defaultPeriodLengthMs / 60000));
    }
    return name;
  }, [stored]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const next = {
      teamName: teamName.trim() || "Tyloo FC",
      logoDataUrl: stored?.logoDataUrl ?? null,
      defaultPeriodCount: periodCount,
      defaultPeriodLengthMs: minutes * 60 * 1000,
      deviceName: device.trim() || "Match iPad",
      firstUseHelpSeen: stored?.firstUseHelpSeen ?? true,
      updatedAt: Date.now(),
    };
    await setSetting(SETTING_KEYS.appSettings, next);
    await setDeviceName(next.deviceName);
    await enqueueMutation({ id: createId(), kind: "UPSERT_SETTINGS", payload: next });
    requestSync();
    setSaved(true);
  }

  return (
    <form className="flex max-w-xl flex-col gap-4" onSubmit={(event) => void onSave(event)}>
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
      <Field label="Device name" htmlFor="device">
        <Input id="device" value={device} onChange={(event) => setDevice(event.target.value)} />
      </Field>
      <Button variant="primary" type="submit">
        Save settings
      </Button>
      {saved ? <p role="status">Settings saved on this device.</p> : null}
      <Button
        onClick={async () => {
          await apiPost("/api/auth/logout", {}).catch(() => undefined);
          await clearLocalSession();
          navigate("/unlock", { replace: true });
        }}
      >
        Log out this device
      </Button>
    </form>
  );
}
