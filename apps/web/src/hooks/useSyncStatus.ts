import { useEffect, useState } from "react";
import { getSyncStatus, subscribeSync, type SyncStatus } from "../features/sync/syncService";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState(getSyncStatus);
  useEffect(() => subscribeSync(setStatus), []);
  return status;
}
