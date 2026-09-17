import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { bootstrapLocalApp } from "./features/bootstrap/localBootstrap";
import { markStorageUnavailable } from "./features/storage/storageHealth";
import { getDeviceId } from "./lib/device";
import { markAppShellCached } from "./pwa/offlineReadiness";
import { notifyUpdateAvailable } from "./pwa/updateManager";
import { startVisibilityRecovery } from "./pwa/visibilityRecovery";
import "./styles.css";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifyUpdateAvailable(async () => {
      await updateSW(true);
    });
  },
  onOfflineReady() {
    markAppShellCached();
  },
});

startVisibilityRecovery();
void getDeviceId();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Touchline could not find the root element.");
}

void bootstrapLocalApp()
  .catch(() => {
    markStorageUnavailable("Touchline could not open the local database on this iPad.");
  })
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  });
