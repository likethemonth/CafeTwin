// Schematic drive-through lane geometry for LaneTwin.
// SCHEMATIC ONLY: layout inferred from aerial footage (single lane wrapping a small kiosk),
// not a measured reconstruction. World units are arbitrary "metres-ish"; x = east, z = south.
import { PRESET_ZONES } from "../../store";
import type { ZoneRole } from "../../types";

export type XZ = [number, number];

/** Kiosk footprint (axis-aligned box in xz). */
export const KIOSK = { minX: -1.5, maxX: 3.5, minZ: -6, maxZ: 6, height: 3 };
export const LANE_WIDTH = 2.6;

function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 8): XZ[] {
  const out: XZ[] = [];
  for (let i = 1; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}

/**
 * Lane centreline: entry from the west along the south side of the kiosk,
 * turns the south-east corner, runs north past Window 1 and Window 2 on the
 * east wall... (z decreases = north), then exits.
 */
export const LANE: XZ[] = [
  [-4, 8],
  [3.5, 8],
  // corner centred at (3.5, 6) radius 2: from angle +90deg (south) to 0 (east)
  ...arc(3.5, 6, 2, Math.PI / 2, 0),
  [5.5, 6],
  [5.5, -11],
];

const segLens: number[] = [];
let total = 0;
for (let i = 0; i < LANE.length - 1; i++) {
  const [x0, z0] = LANE[i];
  const [x1, z1] = LANE[i + 1];
  const l = Math.hypot(x1 - x0, z1 - z0);
  segLens.push(l);
  total += l;
}
export const LANE_LENGTH = total;

export interface LanePoint {
  x: number;
  z: number;
  /** heading in radians in the xz plane: atan2(dz, dx). Use rotation.y = -heading for +x-forward meshes. */
  heading: number;
}

export function pointOnLane(progress: number): LanePoint {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  let d = p * total;
  for (let i = 0; i < segLens.length; i++) {
    const l = segLens[i];
    if (d <= l || i === segLens.length - 1) {
      const [x0, z0] = LANE[i];
      const [x1, z1] = LANE[i + 1];
      const f = l > 0 ? Math.min(1, d / l) : 0;
      return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, heading: Math.atan2(z1 - z0, x1 - x0) };
    }
    d -= l;
  }
  const [x, z] = LANE[LANE.length - 1];
  return { x, z, heading: -Math.PI / 2 };
}

/** Sample the centreline between two progress values. */
export function sampleLane(from: number, to: number, step = 0.01): LanePoint[] {
  const out: LanePoint[] = [];
  for (let p = from; p < to; p += step) out.push(pointOnLane(p));
  out.push(pointOnLane(to));
  return out;
}

export interface LaneZoneSeg {
  zoneId: string;
  role: ZoneRole;
  name: string;
  from: number;
  to: number;
  color: string;
}

const RANGES: { role: ZoneRole; from: number; to: number }[] = [
  { role: "queue", from: 0, to: 0.3 },
  { role: "order", from: 0.3, to: 0.55 },
  { role: "pickup", from: 0.6, to: 0.85 },
  { role: "exit", from: 0.9, to: 1 },
];

export const LANE_ZONES: LaneZoneSeg[] = RANGES.map((r) => {
  const z = PRESET_ZONES.find((p) => p.role === r.role);
  return {
    zoneId: z?.id ?? `z-${r.role}`,
    role: r.role,
    name: z?.name ?? r.role,
    from: r.from,
    to: r.to,
    color: z?.color ?? "#94a3b8",
  };
});

/** Service windows sit on the kiosk's east wall, facing the lane. */
function windowAt(progress: number): { x: number; z: number } {
  const p = pointOnLane(progress);
  return { x: KIOSK.maxX, z: p.z };
}
export const WINDOW_1 = windowAt(0.425);
export const WINDOW_2 = windowAt(0.725);
/** Side camera marker: across the lane, looking west at both windows. */
export const SIDE_CAMERA = { x: 9, z: (WINDOW_1.z + WINDOW_2.z) / 2, y: 2.5 };

export const STATUS_COLOR: Record<string, string> = {
  normal: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  uncertain: "#64748b",
  stale: "#64748b",
};
export const SELECTED_COLOR = "#3b82f6";

/** Bounds of the scene in xz, for 2D map viewBox. */
export const SCENE_BOUNDS = { minX: -6, maxX: 11, minZ: -13, maxZ: 10.5 };
