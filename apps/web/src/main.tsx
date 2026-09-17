import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { startSyncRuntime } from "./features/sync/syncService";
import { getDeviceId } from "./lib/device";
import "./styles.css";

registerSW({ immediate: true });
void getDeviceId();
startSyncRuntime();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Tyloo Live could not find the root element.");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
