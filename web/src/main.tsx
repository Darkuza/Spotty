// Einstieg: Gestaltung (Systemschrift des Geräts), Farbschema, Hintergrunddienst für Offline und Push.

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/health.css";
import "./styles/components.css";
import "./styles/medications.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { applyTheme } from "./lib/theme";

applyTheme();
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      (window as unknown as { __spottyNeedsUpdate?: boolean }).__spottyNeedsUpdate = true;
      window.dispatchEvent(new Event("spotty-update"));
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Stündlich und beim Zurückkehren in die App nach einer neuen Version sehen.
      setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void reg.update().catch(() => undefined);
      });
    },
  });
  window.__spottyUpdate = updateSW;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
