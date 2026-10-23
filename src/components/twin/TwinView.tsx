// LaneTwin twin panel: 3D / map toggle, WebGL fallback, staff occupancy view.
import { Component, lazy, Suspense, useMemo, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import { MapView2D } from "./MapView2D";
import "./twin.css";

const Twin3D = lazy(() => import("./Twin3D"));
const AerialTwin3D = lazy(() => import("./AerialTwin3D"));
const StaffTwin3D = lazy(() => import("./StaffTwin3D"));

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn("[TwinView] 3D view failed, falling back to map", err, info.componentStack);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function StaffOccupancy() {
  const zones = useStore((s) => s.zones).filter((z) => z.sourceId === "staff");
  const { now } = useDerived();
  const people = now.filter((s) => s.track.cls === "person" && s.bbox != null && !s.stale);
  const unzoned = people.filter((p) => !p.zoneId || !zones.some((z) => z.id === p.zoneId)).length;
  return (
    <div className="tw-canvas-wrap tw-occ">
      <div className="tw-occ-head">
        <span className="tw-badge tw-badge-schematic">OCCUPANCY</span>
        <span className="tw-dim">Indoor staff clip — not linked to the outdoor twin. Counts at current replay time only.</span>
      </div>
      <div className="tw-occ-grid">
        <div className="tw-occ-card">
          <div className="tw-occ-name">People visible</div>
          <div className="tw-occ-num tw-mono">{people.length}</div>
        </div>
        {zones.map((z) => {
          const n = people.filter((p) => p.zoneId === z.id).length;
          return (
            <div key={z.id} className="tw-occ-card" style={{ borderColor: z.color }}>
              <div className="tw-occ-name"><span className="tw-swatch" style={{ background: z.color }} />{z.name}</div>
              <div className="tw-occ-num tw-mono">{n}</div>
            </div>
          );
        })}
        {zones.length > 0 && (
          <div className="tw-occ-card">
            <div className="tw-occ-name">Outside zones</div>
            <div className="tw-occ-num tw-mono">{unzoned}</div>
          </div>
        )}
      </div>
      {zones.length === 0 && <div className="tw-dim tw-occ-hint">No staff zones configured. Draw zones on a paused frame to see per-zone counts.</div>}
    </div>
  );
}

export function TwinView() {
  const sourceId = useStore((s) => s.sourceId);
  const view = useStore((s) => s.settings.view);
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const updateSettings = useStore((s) => s.updateSettings);
  const webgl = useMemo(hasWebGL, []);

  const aerialNote = sourceId === "aerial" ? "Aerial clip: moving camera — positions are frame-local, not lane-mapped" : undefined;
  const glNotice = "WebGL unavailable — showing 2D fallback";
  const fallbackFor = (notice?: string): ReactNode =>
    sourceId === "staff" ? <StaffOccupancy /> : <MapView2D notice={notice} />;

  let body: ReactNode;
  if (view === "map") {
    body = fallbackFor(aerialNote);
  } else if (!webgl) {
    body = fallbackFor([glNotice, aerialNote].filter(Boolean).join(" · "));
  } else {
    const scene = sourceId === "aerial" ? <AerialTwin3D /> : sourceId === "staff" ? <StaffTwin3D /> : <Twin3D />;
    body = (
      <CanvasBoundary key={sourceId} fallback={fallbackFor([glNotice, aerialNote].filter(Boolean).join(" · "))}>
        <Suspense fallback={<div className="tw-canvas-wrap tw-loading">Loading 3D…</div>}>
          {scene}
        </Suspense>
      </CanvasBoundary>
    );
  }

  return (
    <div className="tw-root">
      <div className="tw-toolbar">
        <span className="tw-title">Digital twin <span className="tw-dim">· schematic</span></span>
        <div className="tw-seg">
          <button className={`tw-btn${view === "3d" ? " tw-btn-on" : ""}`}
            onClick={() => updateSettings({ view: "3d" })}>3D</button>
          <button className={`tw-btn${view === "map" ? " tw-btn-on" : ""}`}
            onClick={() => updateSettings({ view: "map" })}>{sourceId === "staff" ? "Counts" : "Map"}</button>
        </div>
        <label className="tw-check">
          <input type="checkbox" checked={showZoneLabels} onChange={(e) => updateSettings({ showZoneLabels: e.target.checked })} />
          Zone labels
        </label>
      </div>
      <div className="tw-body">{body}</div>
    </div>
  );
}

export default TwinView;
