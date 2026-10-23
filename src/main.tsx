import React from "react";
import ReactDOM from "react-dom/client";
import "./waretwin-base.css";
import "./styles.css";
import App from "./App";
import { Landing } from "./components/landing/Landing";
import { SOURCES, useStore } from "./store";
import { loadSyntheticSession } from "./demo/synthetic";
import referenceFrames from "./data/drivethrough-observations.json";
import { FrameObservationSchema } from "./types";

// Cached hosted analysis of this exact bundled clip, not synthetic trajectories.
const referenceMarker = "lanetwin-reference-replay-v1";
if (!localStorage.getItem(referenceMarker)) {
  for (const frame of referenceFrames) {
    const observation = FrameObservationSchema.parse(frame);
    if (!useStore.getState().observations.drivethrough[observation.t.toFixed(2)]) {
      useStore.getState().addObservation(observation);
    }
  }
  useStore.getState().setDemoMode("drivethrough", false);
  localStorage.setItem(referenceMarker, "loaded");
}

// Start with a labelled demonstration when a recording has no real analysis yet.
// Existing model results retain their selected evidence mode.
for (const source of SOURCES) {
  if (Object.keys(useStore.getState().observations[source.id]).length === 0) {
    loadSyntheticSession(source.id);
  }
}

// Landing page at "/landing"; the control room stays at "/".
function Root() {
  if (window.location.pathname.replace(/\/$/, "") === "/landing") {
    return <Landing onEnter={() => { window.location.href = "/"; }} />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
