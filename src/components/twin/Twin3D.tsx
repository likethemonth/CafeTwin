// LaneTwin 3D schematic twin.
// Lighting/style approach adapted from WareTwin (MIT, (c) Wayne Chou) Scene3D.tsx — rewritten for LaneTwin.
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import type { TrackState } from "../../logic/contract";
import {
  KIOSK, LANE_WIDTH, LANE_ZONES, SELECTED_COLOR, SIDE_CAMERA, STATUS_COLOR, WINDOW_1, WINDOW_2,
  pointOnLane, sampleLane, type LanePoint,
} from "./lane";
import { VehicleMesh, useSmoothMotion } from "./VehicleMesh";
import "./twin.css";

const CAM_POS = new THREE.Vector3(20, 22, 20);
const CAM_TARGET = new THREE.Vector3(2, 0, -1.5);

type ControlsLike = { target: THREE.Vector3; object: THREE.Camera; update: () => void };

/** Strip of thin boxes following the lane between two progress values. */
function LaneStrip({ from, to, width, y, color, opacity = 1, step = 0.015 }: {
  from: number; to: number; width: number; y: number; color: string; opacity?: number; step?: number;
}) {
  const pieces = useMemo(() => {
    const pts = sampleLane(from, to, step);
    const out: { mid: [number, number]; len: number; rot: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-4) continue;
      out.push({ mid: [(a.x + b.x) / 2, (a.z + b.z) / 2], len: len + 0.08, rot: -Math.atan2(b.z - a.z, b.x - a.x) });
    }
    return out;
  }, [from, to, step]);
  return (
    <group>
      {pieces.map((p, i) => (
        <mesh key={i} position={[p.mid[0], y, p.mid[1]]} rotation={[0, p.rot, 0]} receiveShadow>
          <boxGeometry args={[p.len, 0.02, width]} />
          <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
        </mesh>
      ))}
    </group>
  );
}

function Dashes() {
  const dashes = useMemo(() => {
    const out: LanePoint[] = [];
    for (let p = 0.02; p < 1; p += 0.04) out.push(pointOnLane(p));
    return out;
  }, []);
  return (
    <group>
      {dashes.map((d, i) => (
        <mesh key={i} position={[d.x, 0.045, d.z]} rotation={[0, -d.heading, 0]}>
          <boxGeometry args={[0.45, 0.01, 0.08]} />
          <meshBasicMaterial color="#e2e8f0" />
        </mesh>
      ))}
    </group>
  );
}

function Label({ position, children, className = "" }: { position: [number, number, number]; children: React.ReactNode; className?: string }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className={`tw-label ${className}`}>{children}</div>
    </Html>
  );
}

function Kiosk() {
  const w = KIOSK.maxX - KIOSK.minX, d = KIOSK.maxZ - KIOSK.minZ;
  const cx = (KIOSK.maxX + KIOSK.minX) / 2, cz = (KIOSK.maxZ + KIOSK.minZ) / 2;
  return (
    <group>
      <mesh position={[cx, KIOSK.height / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[w, KIOSK.height, d]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      {/* roof slab with overhang */}
      <mesh position={[cx, KIOSK.height + 0.15, cz]} castShadow>
        <boxGeometry args={[w + 0.8, 0.3, d + 0.8]} />
        <meshStandardMaterial color="#7c4a2d" roughness={0.6} />
      </mesh>
      {[{ w: WINDOW_1, n: "1", sub: "order/pay" }, { w: WINDOW_2, n: "2", sub: "pickup" }].map(({ w: win, n, sub }) => (
        <group key={n}>
          <mesh position={[win.x + 0.03, 1.4, win.z]}>
            <boxGeometry args={[0.06, 1.1, 1.6]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.35} />
          </mesh>
          <Label position={[win.x + 0.2, 2.6, win.z]} className="tw-label-window">
            <b>{n}</b> <span>{sub}</span>
          </Label>
        </group>
      ))}
      <Label position={[cx, KIOSK.height + 0.8, cz]} className="tw-label-muted">Kiosk</Label>
    </group>
  );
}

function CameraMarker() {
  return (
    <group position={[SIDE_CAMERA.x, 0, SIDE_CAMERA.z]}>
      <mesh position={[0, SIDE_CAMERA.y / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, SIDE_CAMERA.y, 8]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[-0.2, SIDE_CAMERA.y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.3, 0.6, 4]} />
        <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.4} />
      </mesh>
      <Label position={[0, SIDE_CAMERA.y + 0.7, 0]} className="tw-label-cam">Side cam</Label>
    </group>
  );
}

function vehicleColor(s: TrackState): string {
  if (s.stale || s.track.uncertain) return STATUS_COLOR.stale;
  return STATUS_COLOR[s.status] ?? STATUS_COLOR.uncertain;
}

function Vehicle({ s, selected, showLabel }: { s: TrackState; selected: boolean; showLabel: boolean }) {
  const select = useStore((st) => st.select);
  const ref = useRef<THREE.Group>(null);
  const target = pointOnLane(s.laneProgress ?? 0);
  const init = useRef<[number, number, number]>([target.x, 0, target.z]);
  const color = vehicleColor(s);
  const opacity = s.estimated || s.stale ? 0.5 : 1;

  const wheels = useRef<(THREE.Object3D | null)[]>([]);
  useSmoothMotion(ref, target.x, target.z, -target.heading, wheels);

  return (
    <group
      ref={ref}
      position={init.current}
      rotation={[0, -target.heading, 0]}
      onClick={(e) => { e.stopPropagation(); select(selected ? null : s.track.id); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      <VehicleMesh s={s} selected={selected} showLabel={showLabel} color={color} opacity={opacity} wheels={wheels} />
    </group>
  );
}

function Scene({ controls }: { controls: React.MutableRefObject<ControlsLike | null> }) {
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const selectedId = useStore((s) => s.selectedTrackId);
  const select = useStore((s) => s.select);
  const { now } = useDerived();
  const vehicles = now.filter((s) => s.track.cls === "vehicle" && s.laneProgress != null);

  return (
    <>
      <color attach="background" args={["#0b1220"]} />
      <fog attach="fog" args={["#0b1220", 45, 90]} />
      <ambientLight intensity={0.45} color="#b9c6e0" />
      <hemisphereLight args={["#9db4e0", "#1a2233", 0.5]} />
      <directionalLight position={[12, 25, 10]} intensity={1.5} color="#e8eefc" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20}
        shadow-camera-top={20} shadow-camera-bottom={-20} shadow-bias={-0.0004} />
      <pointLight position={[7, 5, 0]} intensity={0.8} color="#22d3ee" distance={18} decay={1.5} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, -0.01, -1]} receiveShadow onClick={() => select(null)}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#111a2b" roughness={1} />
      </mesh>
      <gridHelper args={[60, 30, "#1e293b", "#162033"]} position={[2, 0, -1]} />

      {/* lane: asphalt + kerbs + zone overlays + centre dashes */}
      <LaneStrip from={0} to={1} width={LANE_WIDTH + 0.3} y={0.01} color="#64748b" />
      <LaneStrip from={0} to={1} width={LANE_WIDTH} y={0.02} color="#1f2937" />
      {LANE_ZONES.map((z) => (
        <LaneStrip key={z.zoneId} from={z.from} to={z.to} width={LANE_WIDTH * 0.92} y={0.035} color={z.color} opacity={0.28} />
      ))}
      <Dashes />
      {showZoneLabels && LANE_ZONES.map((z) => {
        const p = pointOnLane((z.from + z.to) / 2);
        const off = z.role === "queue" ? [0, 2.2] : [2.6, 0];
        return (
          <Label key={z.zoneId} position={[p.x + off[0], 0.3, p.z + off[1]]} className="tw-label-zone">
            <span className="tw-swatch" style={{ background: z.color }} />{z.name}
          </Label>
        );
      })}
      <Label position={[pointOnLane(0).x - 1.2, 0.4, pointOnLane(0).z]} className="tw-label-muted">Entry →</Label>
      <Label position={[pointOnLane(1).x, 0.4, pointOnLane(1).z - 1.2]} className="tw-label-muted">Exit ↑</Label>

      <Kiosk />
      <CameraMarker />

      {vehicles.map((s) => (
        <Vehicle key={s.track.id} s={s} selected={s.track.id === selectedId} showLabel />
      ))}

      <OrbitControls
        ref={controls as never}
        makeDefault
        target={CAM_TARGET.toArray() as [number, number, number]}
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={70}
      />
    </>
  );
}

export function Twin3D() {
  const controls = useRef<ControlsLike | null>(null);
  const { now } = useDerived();
  const unmapped = now.filter((s) => s.track.cls === "vehicle" && s.laneProgress == null && s.bbox != null).length;

  const reset = () => {
    const c = controls.current;
    if (!c) return;
    c.object.position.copy(CAM_POS);
    c.target.copy(CAM_TARGET);
    c.update();
  };

  return (
    <div className="tw-canvas-wrap">
      <Canvas shadows dpr={[1, 2]} camera={{ position: CAM_POS.toArray() as [number, number, number], fov: 35, near: 0.1, far: 200 }}>
        <Scene controls={controls} />
      </Canvas>
      <div className="tw-overlay tw-overlay-tl">
        <span className="tw-badge tw-badge-schematic">SCHEMATIC</span>
        {unmapped > 0 && <span className="tw-badge tw-badge-warn">{unmapped} unmapped</span>}
      </div>
      <div className="tw-overlay tw-overlay-tr">
        <button className="tw-btn" onClick={reset}>Reset view</button>
      </div>
    </div>
  );
}

export default Twin3D;
