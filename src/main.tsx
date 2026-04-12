import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

// withGlobalTauri: true なので window.__TAURI_INTERNALS__ が同期的に使える
function getWindowLabel(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (window as any).__TAURI_INTERNALS__;
    if (internals?.metadata?.currentWindow?.label) {
      return internals.metadata.currentWindow.label;
    }
  } catch { /* ignore */ }
  return "main";
}

const label = getWindowLabel();

if (label === "settings") {
  import("./components/SettingsWindow").then((mod) => {
    const SettingsWindow = mod.default;
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <SettingsWindow />
      </React.StrictMode>
    );
  });
} else {
  import("./App").then((mod) => {
    const App = mod.default;
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}
