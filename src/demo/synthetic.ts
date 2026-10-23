// CLEARLY SYNTHETIC demo observations (provenance "synthetic"). Not derived from any model output.
import { useStore } from "../store";
import { cancelSessions } from "../vision/client";
import type { BBox, Detection, FrameObservation, SourceId } from "../types";

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpBox = (a: BBox, b: BBox, k: number): BBox => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
const r3 = (b: BBox): BBox => b.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000) as BBox;

/** Piecewise-linear keyframe path; returns null outside [first,last]. */
function path(keys: [number, BBox][], t: number): BBox | null {
  if (t < keys[0][0] || t > keys[keys.length - 1][0]) return null;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, b0] = keys[i];
    const [t1, b1] = keys[i + 1];
    if (t >= t0 && t <= t1) return r3(lerpBox(b0, b1, t1 === t0 ? 0 : (t - t0) / (t1 - t0)));
  }
  return r3(keys[keys.length - 1][1]);
}

// Car A: present at start at Window 1, dwells, moves to Window 2, then exits right.
const CAR_A: [number, BBox][] = [
  [0, [0.03, 0.45, 0.47, 0.76]],
  [4, [0.03, 0.45, 0.47, 0.76]],
  [7, [0.52, 0.45, 0.94, 0.76]],
  [12, [0.53, 0.45, 0.95, 0.76]],
  [14, [0.62, 0.45, 0.999, 0.76]],
  [15, [0.92, 0.46, 0.999, 0.76]],
];
// Car B: arrives from the left ~t=6, enters queue, then reaches Window 1.
const CAR_B: [number, BBox][] = [
  [6, [0.0, 0.5, 0.05, 0.78]],
  [8, [0.0, 0.48, 0.2, 0.78]],
  [11, [0.03, 0.46, 0.46, 0.77]],
  [16, [0.03, 0.46, 0.46, 0.77]],
];
// Staff: two persons moving slightly.
const P1: [number, BBox][] = [
  [0, [0.2, 0.25, 0.32, 0.9]],
  [6, [0.3, 0.25, 0.42, 0.9]],
  [11, [0.22, 0.26, 0.34, 0.9]],
];
const P2: [number, BBox][] = [
  [0, [0.6, 0.3, 0.7, 0.88]],
  [5, [0.62, 0.3, 0.72, 0.88]],
  [11, [0.55, 0.3, 0.65, 0.88]],
];

export function loadSyntheticSession(sourceId: SourceId): number {
  cancelSessions(sourceId);
  const st = useStore.getState();
  st.clearObservations(sourceId, "synthetic");
  st.setDemoMode(sourceId, true);
  const sessionId = `${sourceId}:synthetic`;
  const dur = sourceId === "staff" ? 10 : 15;
  let n = 0;
  for (let t = 0; t <= dur; t += 1) {
    const dets: Detection[] = [];
    if (sourceId === "drivethrough") {
      const a = path(CAR_A, t);
      if (a) dets.push({ id: "v1", cls: "vehicle", bbox: a, colour: "black", note: "SYNTHETIC demo car A" });
      const b = path(CAR_B, t);
      if (b) dets.push({ id: "v2", cls: "vehicle", bbox: b, colour: "silver", note: "SYNTHETIC demo car B" });
    } else if (sourceId === "staff") {
      const a = path(P1, t);
      if (a) dets.push({ id: "p1", cls: "person", bbox: a, note: "SYNTHETIC demo person" });
      const b = path(P2, t);
      if (b) dets.push({ id: "p2", cls: "person", bbox: b, note: "SYNTHETIC demo person" });
    } else {
      const x = 0.3 + t * 0.02;
      dets.push({ id: "v1", cls: "vehicle", bbox: r3([x, 0.4, x + 0.08, 0.5]), note: "SYNTHETIC demo car (frame-local)" });
    }
    const obs: FrameObservation = { sessionId, t, width: 768, height: 432, detections: dets, provenance: "synthetic", model: "synthetic-demo" };
    st.addObservation(obs);
    n++;
  }
  useStore.getState().setAnalysis(sourceId, { kind: "done", frames: n });
  return n;
}
