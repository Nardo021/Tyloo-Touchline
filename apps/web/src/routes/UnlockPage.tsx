import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { apiPost, ApiError } from "../lib/api";
import { getDeviceId, getDeviceName } from "../lib/device";
import { storeLocalSession } from "../lib/session";
import { bootstrapFromServer, startSyncRuntime } from "../features/sync/syncService";

export function UnlockPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await apiPost<{ token: string; expiresAt: number }>("/api/auth/pin", {
        pin,
        deviceId: await getDeviceId(),
        deviceName: await getDeviceName(),
      });
      await storeLocalSession(result.token, result.expiresAt);
      startSyncRuntime();
      await bootstrapFromServer();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("The server is unavailable. This iPad must be unlocked once while connected.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="text-3xl font-bold">Tyloo Live</h1>
      <p className="mt-2 text-pretty">Enter the team PIN to trust this device. You will not need it before every match.</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        <Field label="PIN" htmlFor="pin" error={error ?? undefined}>
          <Input
            id="pin"
            name="pin"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "pin-error" : undefined}
          />
        </Field>
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Unlocking…" : "Unlock this device"}
        </Button>
      </form>
    </main>
  );
}
