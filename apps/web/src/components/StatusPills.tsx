import type { ConnectionState } from "../features/sync/syncService";
import type { WakeStatus } from "../lib/wakeLock";

export function SyncStatusText({ state, pending }: { state: ConnectionState; pending: number }) {
  switch (state) {
    case "synced":
      return <span>Synced</span>;
    case "syncing":
      return <span>Syncing{pending ? ` · ${pending} waiting` : ""}</span>;
    case "offline":
      return <span>Offline{pending ? ` · ${pending} waiting to sync` : ""}</span>;
    case "server_unavailable":
      return <span>Server unavailable{pending ? ` · ${pending} stored on this device` : ""}</span>;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function WakeStatusText({ status }: { status: WakeStatus }) {
  switch (status) {
    case "awake":
      return <span>Awake</span>;
    case "released":
      return <span>Screen may sleep</span>;
    case "unsupported":
      return <span>Wake lock unavailable</span>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
