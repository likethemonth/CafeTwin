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

// Locked reference replay: 32 hosted-model frames (gpt-6-astra, every 0.5 s) of this exact bundled clip.
// Reloaded on every page load so stale, mixed or synthetic caches can never alter the drive-through view.
{
  const st = useStore.getState();
  st.clearObservations("drivethrough");
  st.clearObservations("drivethrough", "synthetic");
  for (const frame of referenceFrames) st.addObservation(FrameObservationSchema.parse(frame));
  useStore.getState().setDemoMode("drivethrough", false);
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
