import type { WakeStatus } from "../lib/wakeLock";

export function WakeStatusText({ status }: { status: WakeStatus }) {
  switch (status) {
    case "awake":
      return <span>Awake</span>;
    case "released":
    case "failed":
      return <span>Screen may sleep</span>;
    case "unsupported":
      return <span>Screen may sleep</span>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
