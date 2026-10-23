// LaneTwin top-down schematic map (SVG). Concept after WareTwin MapView2D (MIT, (c) Wayne Chou); code is new.
import { useMemo } from "react";
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import type { TrackState } from "../../logic/contract";
import {
  KIOSK, LANE_WIDTH, LANE_ZONES, SCENE_BOUNDS, SELECTED_COLOR, SIDE_CAMERA, STATUS_COLOR, WINDOW_1, WINDOW_2,
  pointOnLane, sampleLane,
} from "./lane";
import "./twin.css";

function pathFor(from: number, to: number): string {
  return sampleLane(from, to, 0.01).map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(" ");
}

function colorOf(s: TrackState): string {
  if (s.stale || s.track.uncertain) return STATUS_COLOR.stale;
  return STATUS_COLOR[s.status] ?? STATUS_COLOR.uncertain;
}

export function MapView2D({ notice }: { notice?: string }) {
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const selectedId = useStore((s) => s.selectedTrackId);
  const select = useStore((s) => s.select);
  const { now } = useDerived();
  const vehicles = now.filter((s) => s.track.cls === "vehicle" && s.laneProgress != null);
  const unmapped = now.filter((s) => s.track.cls === "vehicle" && s.laneProgress == null && s.bbox != null).length;

  const lanePath = useMemo(() => pathFor(0, 1), []);
  const zonePaths = useMemo(() => LANE_ZONES.map((z) => ({ ...z, d: pathFor(z.from, z.to) })), []);
  const b = SCENE_BOUNDS;
  const vb = `${b.minX} ${b.minZ} ${b.maxX - b.minX} ${b.maxZ - b.minZ}`;
  const fs = 0.55;

  return (
    <div className="tw-canvas-wrap tw-map">
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="tw-svg" onClick={() => select(null)}>
        <defs>
          <pattern id="tw-grid" width="2" height="2" patternUnits="userSpaceOnUse">
            <path d="M2 0 L0 0 0 2" fill="none" stroke="#162033" strokeWidth="0.05" />
          </pattern>
        </defs>
        <rect x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="url(#tw-grid)" />
        {/* lane */}
        <path d={lanePath} stroke="#64748b" strokeWidth={LANE_WIDTH + 0.3} fill="none" strokeLinejoin="round" />
        <path d={lanePath} stroke="#1f2937" strokeWidth={LANE_WIDTH} fill="none" strokeLinejoin="round" />
        {zonePaths.map((z) => (
          <path key={z.zoneId} d={z.d} stroke={z.color} strokeOpacity={0.3} strokeWidth={LANE_WIDTH * 0.92} fill="none" />
        ))}
        <path d={lanePath} stroke="#e2e8f0" strokeWidth={0.08} strokeDasharray="0.45 0.55" fill="none" />
        {showZoneLabels && zonePaths.map((z) => {
          const p = pointOnLane((z.from + z.to) / 2);
          const [dx, dz] = z.role === "queue" ? [0, 2.2] : [1.7, 0];
          return (
            <text key={z.zoneId} x={p.x + dx} y={p.z + dz} fontSize={fs} fill={z.color}
              textAnchor={z.role === "queue" ? "middle" : "start"} dominantBaseline="middle">{z.name}</text>
          );
        })}
        {/* kiosk */}
        <rect x={KIOSK.minX} y={KIOSK.minZ} width={KIOSK.maxX - KIOSK.minX} height={KIOSK.maxZ - KIOSK.minZ}
          fill="#334155" stroke="#7c4a2d" strokeWidth={0.25} rx={0.2} />
        <text x={(KIOSK.minX + KIOSK.maxX) / 2} y={(KIOSK.minZ + KIOSK.maxZ) / 2} fontSize={fs} fill="#94a3b8" textAnchor="middle">Kiosk</text>
        {[{ w: WINDOW_1, n: "1" }, { w: WINDOW_2, n: "2" }].map(({ w, n }) => (
          <g key={n}>
            <rect x={w.x - 0.15} y={w.z - 0.8} width={0.3} height={1.6} fill="#7dd3fc" />
            <text x={w.x - 0.5} y={w.z} fontSize={0.8} fill="#e2e8f0" textAnchor="end" dominantBaseline="middle" fontWeight={700}>{n}</text>
          </g>
        ))}
        {/* side camera */}
        <g transform={`translate(${SIDE_CAMERA.x} ${SIDE_CAMERA.z})`}>
          <polygon points="-0.5,0 0.2,-0.35 0.2,0.35" fill="#22d3ee" />
          <text x={0} y={1} fontSize={fs * 0.9} fill="#67e8f9" textAnchor="middle">Side cam</text>
        </g>
        <text x={pointOnLane(0).x - 0.3} y={pointOnLane(0).z + 2.1} fontSize={fs} fill="#94a3b8">Entry →</text>
        <text x={pointOnLane(1).x} y={pointOnLane(1).z - 0.6} fontSize={fs} fill="#94a3b8" textAnchor="middle">Exit ↑</text>
        {/* vehicles */}
        {vehicles.map((s) => {
          const p = pointOnLane(s.laneProgress ?? 0);
          const sel = s.track.id === selectedId;
          const deg = (p.heading * 180) / Math.PI;
          return (
            <g key={s.track.id} transform={`translate(${p.x} ${p.z})`} className="tw-map-veh"
              onClick={(e) => { e.stopPropagation(); select(sel ? null : s.track.id); }}>
              <rect x={-1} y={-0.5} width={2} height={1} rx={0.25} transform={`rotate(${deg})`}
                fill={colorOf(s)} fillOpacity={s.estimated || s.stale ? 0.5 : 1}
                stroke={sel ? SELECTED_COLOR : "#0b1220"} strokeWidth={sel ? 0.25 : 0.08} />
              <text x={-1.4} y={0} fontSize={fs} fill={sel ? "#93c5fd" : "#e2e8f0"} textAnchor="end" dominantBaseline="middle" className="tw-mono">
                {s.track.id}{s.dwellS != null ? ` ${s.dwellS.toFixed(1)}s` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="tw-overlay tw-overlay-tl">
        <span className="tw-badge tw-badge-schematic">SCHEMATIC</span>
        {unmapped > 0 && <span className="tw-badge tw-badge-warn">{unmapped} unmapped</span>}
      </div>
      {notice && <div className="tw-overlay tw-overlay-bl tw-notice">{notice}</div>}
    </div>
  );
}

export default MapView2D;
