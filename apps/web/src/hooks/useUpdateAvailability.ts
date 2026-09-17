import { useEffect, useState } from "react";
import { subscribeUpdateAvailability } from "../pwa/updateManager";

export function useUpdateAvailability(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => subscribeUpdateAvailability(setAvailable), []);
  return available;
}
