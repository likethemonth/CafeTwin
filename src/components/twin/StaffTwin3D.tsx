// LaneTwin staff/kiosk-interior 3D schematic, informed by the Staffworking frame
// (espresso station left, prep shelving behind, service counter with till front-centre,
// glass pastry display right, service/pickup window on the back wall). SCHEMATIC ONLY.
// People are placed by mapping bbox bottom-centre (image x, y) onto the floor: a rough,
// frame-local estimate that ignores perspective and is NOT linked to the outdoor twin.
import { useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import type { TrackState } from "../../logic/contract";
import type { Zone } from "../../types";
import { SELECTED_COLOR } from "./lane";
import { Label, SceneLights, TrackLabel, pointerHandlers, statusColor, useSmoothMotion } from "./VehicleMesh";
import "./twin.css";

const FW = 12; // floor width (x)
const FD = 9; // floor depth (z)
/** image (x, y) -> floor (X, Z). y=0 (top of frame) = back wall, y=1 = near camera. */
const imgToFloor = (x: number, y: number): [number, number] => [(x - 0.5) * FW, (y - 0.5) * FD];

const CAM_POS = new THREE.Vector3(2, 11, 13);
const CAM_TARGET = new THREE.Vector3(0, 0.5, 0);
type ControlsLike = { target: THREE.Vector3; object: THREE.Camera; update: () => void };

function Box({ p, s, color, emissive, opacity = 1 }: { p: [number, number, number]; s: [number, number, number]; color: string; emissive?: string; opacity?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={0.7} transparent={opacity < 1} opacity={opacity}
        emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.35 : 0} />
    </mesh>
  );
}

function Interior() {
  const select = useStore((s) => s.select);
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const backZ = -FD / 2;
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={() => select(null)}>
        <planeGeometry args={[FW, FD]} />
        <meshStandardMaterial color="#1a2334" roughness={1} />
      </mesh>
      <gridHelper args={[FW, 12, "#24324a", "#1c283c"]} position={[0, 0.005, 0]} />
      {/* back wall with service/pickup window */}
      <Box p={[-3.6, 1.5, backZ]} s={[4.8, 3, 0.15]} color="#2a3547" />
      <Box p={[3.9, 1.5, backZ]} s={[4.2, 3, 0.15]} color="#2a3547" />
      <Box p={[0, 2.6, backZ]} s={[3.0, 0.8, 0.15]} color="#2a3547" />
      <Box p={[0, 0.5, backZ]} s={[3.0, 1.0, 0.15]} color="#2a3547" />
      <Box p={[0, 1.6, backZ]} s={[3.0, 1.2, 0.05]} color="#7dd3fc" emissive="#38bdf8" opacity={0.45} />
      {/* left wall + shelving */}
      <Box p={[-FW / 2, 1.5, 0]} s={[0.15, 3, FD]} color="#243044" />
      <Box p={[-5.6, 1.4, -2.6]} s={[0.6, 2.8, 3.2]} color="#7c4a2d" />
      {/* prep counter (back-left) */}
      <Box p={[-2.6, 0.45, -3.6]} s={[3.2, 0.9, 1.0]} color="#475569" />
      {/* espresso station (left) */}
      <Box p={[-5.0, 0.45, 1.2]} s={[1.6, 0.9, 2.6]} color="#475569" />
      <Box p={[-5.0, 1.25, 1.0]} s={[1.0, 0.7, 1.4]} color="#cbd5e1" />
      {/* main service counter with till (front-centre) */}
      <Box p={[-0.6, 0.5, 2.6]} s={[5.4, 1.0, 1.0]} color="#a0673a" />
      <Box p={[-0.4, 1.15, 2.5]} s={[0.6, 0.3, 0.45]} color="#0f172a" />
      {/* glass pastry display (right) */}
      <Box p={[3.4, 0.45, 0.6]} s={[1.4, 0.9, 4.0]} color="#e2e8f0" />
      <Box p={[3.4, 1.25, 0.6]} s={[1.3, 0.7, 3.9]} color="#bae6fd" opacity={0.3} />
      {showZoneLabels && (
        <>
          <Label position={[0, 3.3, backZ]} className="tw-label-window"><b>W</b> <span>service / pickup window</span></Label>
          <Label position={[-5.0, 2.1, 1.0]} className="tw-label-muted">Espresso</Label>
          <Label position={[-2.6, 1.3, -3.6]} className="tw-label-muted">Prep</Label>
          <Label position={[-0.6, 1.6, 3.1]} className="tw-label-muted">Counter / till</Label>
          <Label position={[3.4, 2.0, 0.6]} className="tw-label-muted">Display</Label>
        </>
      )}
    </group>
  );
}

function ZonePatch({ z, showLabel }: { z: Zone; showLabel: boolean }) {
  const { geom, centre } = useMemo(() => {
    const shape = new THREE.Shape();
    z.points.forEach(([x, y], i) => {
      const [X, Z] = imgToFloor(x, y);
      // shape lives in XY, rotated -90deg about X so shape-Y maps to -Z
      if (i === 0) shape.moveTo(X, -Z); else shape.lineTo(X, -Z);
    });
    const n = z.points.length || 1;
    const cx = z.points.reduce((a, p) => a + p[0], 0) / n, cy = z.points.reduce((a, p) => a + p[1], 0) / n;
    return { geom: new THREE.ShapeGeometry(shape), centre: imgToFloor(cx, cy) };
  }, [z.points]);
  return (
    <group>
      <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <meshBasicMaterial color={z.color} transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {showLabel && (
        <Label position={[centre[0], 0.25, centre[1]]} className="tw-label-zone">
          <span className="tw-swatch" style={{ background: z.color }} />{z.name}
        </Label>
      )}
    </group>
  );
}

function Person({ s, selected }: { s: TrackState; selected: boolean }) {
  const select = useStore((st) => st.select);
  const ref = useRef<THREE.Group>(null);
  const b = s.bbox!;
  const [tx, tz] = imgToFloor((b[0] + b[2]) / 2, b[3]);
  const init = useRef<[number, number, number]>([tx, 0, tz]);
  const color = statusColor(s);
  const op = s.estimated || s.stale ? 0.5 : 1;
  useSmoothMotion(ref, tx, tz, null);
  return (
    <group ref={ref} position={init.current}
      onClick={(e) => { e.stopPropagation(); select(selected ? null : s.track.id); }} {...pointerHandlers}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.9, 4, 12]} />
        <meshStandardMaterial color={color} transparent={op < 1} opacity={op}
          emissive={selected ? SELECTED_COLOR : "#000000"} emissiveIntensity={selected ? 0.6 : 0} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#e2c8a8" transparent={op < 1} opacity={op} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 2.0, 12, 1, true]} />
          <meshBasicMaterial color={SELECTED_COLOR} wireframe />
        </mesh>
      )}
      <TrackLabel s={s} selected={selected} color={color} y={2.2} />
    </group>
  );
}

function Scene({ controls }: { controls: React.MutableRefObject<ControlsLike | null> }) {
  const selectedId = useStore((s) => s.selectedTrackId);
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const allZones = useStore((s) => s.zones);
  const zones = useMemo(() => allZones.filter((z) => z.sourceId === "staff"), [allZones]);
  const { now } = useDerived();
  const people = now.filter((s) => s.track.cls === "person" && s.bbox != null);
  return (
    <>
      <SceneLights shadowExtent={10} />
      <pointLight position={[0, 3.5, 0]} intensity={0.8} color="#fde68a" distance={14} decay={1.5} />
      <Interior />
      {zones.map((z) => <ZonePatch key={z.id} z={z} showLabel={showZoneLabels} />)}
      {people.map((s) => <Person key={s.track.id} s={s} selected={s.track.id === selectedId} />)}
      <OrbitControls ref={controls as never} makeDefault target={CAM_TARGET.toArray() as [number, number, number]}
        enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={40} />
    </>
  );
}

function OccupancyCard() {
  const allZones = useStore((s) => s.zones);
  const zones = allZones.filter((z) => z.sourceId === "staff");
  const { now } = useDerived();
  const people = now.filter((s) => s.track.cls === "person" && s.bbox != null && !s.stale);
  const unzoned = people.filter((p) => !p.zoneId || !zones.some((z) => z.id === p.zoneId)).length;
  return (
    <div className="tw-occ-mini">
      <div className="tw-occ-mini-row"><span>People visible</span><b className="tw-mono">{people.length}</b></div>
      {zones.map((z) => (
        <div key={z.id} className="tw-occ-mini-row">
          <span><span className="tw-swatch" style={{ background: z.color }} />{z.name}</span>
          <b className="tw-mono">{people.filter((p) => p.zoneId === z.id).length}</b>
        </div>
      ))}
      {zones.length > 0 && <div className="tw-occ-mini-row"><span>Outside zones</span><b className="tw-mono">{unzoned}</b></div>}
      {zones.length === 0 && <div className="tw-dim">No staff zones — draw some on a paused frame.</div>}
    </div>
  );
}

export function StaffTwin3D() {
  const controls = useRef<ControlsLike | null>(null);
  const reset = () => {
    const c = controls.current;
    if (!c) return;
    c.object.position.copy(CAM_POS);
    c.target.copy(CAM_TARGET);
    c.update();
  };
  return (
    <div className="tw-canvas-wrap">
      <Canvas shadows dpr={[1, 2]} camera={{ position: CAM_POS.toArray() as [number, number, number], fov: 40, near: 0.1, far: 120 }}>
        <Scene controls={controls} />
      </Canvas>
      <div className="tw-overlay tw-overlay-tl">
        <span className="tw-badge tw-badge-schematic">SCHEMATIC</span>
        <span className="tw-badge tw-badge-warn">FRAME-LOCAL ESTIMATE — NOT LINKED TO OUTDOOR TWIN</span>
      </div>
      <div className="tw-overlay tw-overlay-tr">
        <button className="tw-btn" onClick={reset}>Reset view</button>
      </div>
      <div className="tw-overlay tw-overlay-br"><OccupancyCard /></div>
    </div>
  );
}

export default StaffTwin3D;
