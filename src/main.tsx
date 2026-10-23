import React from "react";
import ReactDOM from "react-dom/client";
import "./waretwin-base.css";
import "./styles.css";
import App from "./App";
import { SOURCES, useStore } from "./store";
import { loadSyntheticSession } from "./demo/synthetic";

// Start with a labelled demonstration when a recording has no real analysis yet.
// Existing model results retain their selected evidence mode.
for (const source of SOURCES) {
  if (Object.keys(useStore.getState().observations[source.id]).length === 0) {
    loadSyntheticSession(source.id);
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
