import { Button } from "./ui/Button";
import { applyPendingUpdate } from "../pwa/updateManager";
import { useState } from "react";

export function UpdateBanner({ visible, compact = false }: { visible: boolean; compact?: boolean }) {
  const [later, setLater] = useState(false);
  if (!visible || later) {
    return null;
  }
  return (
    <div className="border-b-2 border-primary bg-surface px-4 py-3" role="status">
      <div className={`flex flex-wrap items-center ${compact ? "justify-between" : "justify-between"} gap-3`}>
        <p className="font-bold">Touchline update available</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void applyPendingUpdate()}>
            Update now
          </Button>
          <Button onClick={() => setLater(true)}>Later</Button>
        </div>
      </div>
    </div>
  );
}
