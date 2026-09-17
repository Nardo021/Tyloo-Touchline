import { useEffect, useState } from "react";
import { subscribeStorageHealth } from "../features/storage/storageHealth";

export function useStorageHealth(): { healthy: boolean; message: string | null } {
  const [state, setState] = useState({ healthy: true, message: null as string | null });
  useEffect(
    () =>
      subscribeStorageHealth((healthy, message) => {
        setState({ healthy, message });
      }),
    [],
  );
  return state;
}
