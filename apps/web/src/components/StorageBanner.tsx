import { useStorageHealth } from "../hooks/useStorageHealth";

export function StorageBanner() {
  const { healthy, message } = useStorageHealth();
  if (healthy) {
    return null;
  }
  return (
    <p className="border-b-2 border-danger bg-danger px-4 py-3 text-center font-bold text-danger-foreground" role="alert">
      {message ?? "This iPad cannot save match data. Do not rely on Touchline until storage works again."}
    </p>
  );
}
