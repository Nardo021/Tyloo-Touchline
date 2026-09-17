import type { OfflineReadiness } from "../pwa/offlineReadiness";

export function MatchReadyList({ readiness }: { readiness: OfflineReadiness | null }) {
  if (!readiness) {
    return <p>Checking this iPad…</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      <ReadyRow ok={readiness.serviceWorkerInstalled} label="App available offline" warn={!readiness.serviceWorkerInstalled} warnText="Open a production build once so the offline package can install." />
      <ReadyRow ok={readiness.databaseReady} label="Local database ready" />
      <ReadyRow ok={readiness.databaseWritable} label="Match data writable" />
      <ReadyRow ok={readiness.teamLoaded} label="Team loaded" />
      <ReadyRow ok={readiness.playersLoaded} label="Players loaded" />
      {readiness.wakeLockSupported ? (
        <ReadyRow ok label="Wake Lock supported" />
      ) : (
        <li className="font-semibold text-warning">⚠ Screen Wake Lock unavailable. Match recording will still work.</li>
      )}
    </ul>
  );
}

function ReadyRow({
  ok,
  label,
  warn,
  warnText,
}: {
  ok: boolean;
  label: string;
  warn?: boolean;
  warnText?: string;
}) {
  if (ok) {
    return <li className="font-semibold">✓ {label}</li>;
  }
  if (warn) {
    return (
      <li className="font-semibold text-warning">
        ⚠ {label}. {warnText}
      </li>
    );
  }
  return <li className="font-semibold text-danger">✗ {label}</li>;
}
