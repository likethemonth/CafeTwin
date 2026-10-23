// LaneTwin aerial-site 3D schematic. Layout traced by eye from the Aerialview drone frame
// (kiosk centre-left, drive-through lane on its east side wrapping south, parking to the east,
// arterial road on the west). SCHEMATIC ONLY — not a measured reconstruction.
// Detections are placed by mapping bbox centre (normalised image x,y) straight onto the ground
// plane. The drone drifts, so positions are frame-local, not site-registered.
import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import type { TrackState } from "../../logic/contract";
import { Label, SceneLights, VehicleMesh, pointerHandlers, useSmoothMotion } from "./VehicleMesh";
import "./twin.css";

/** Image -> ground mapping (16:9 frame). */
const W = 40;
const D = 22.5;
export const imgToGround = (x: number, y: number): [number, number] => [(x - 0.5) * W, (y - 0.5) * D];

const CAM_POS = new THREE.Vector3(6, 34, 26);
const CAM_TARGET = new THREE.Vector3(0, 0, 0);

type ControlsLike = { target: THREE.Vector3; object: THREE.Camera; update: () => void };

// Kiosk footprint (image coords ~ x 0.37..0.50, y 0.44..0.81)
const [KX0, KZ0] = imgToGround(0.37, 0.44);
const [KX1, KZ1] = imgToGround(0.5, 0.81);

/** Drive-through lane centreline in image coords: south of the kiosk, then north along its east wall. */
const LANE_IMG: [number, number][] = [[0.36, 0.88], [0.5, 0.88], [0.535, 0.83], [0.535, 0.4], [0.535, 0.12]];

function Strip({ pts, width, y, color, opacity = 1 }: { pts: [number, number][]; width: number; y: number; color: string; opacity?: number }) {
  const pieces = useMemo(() => {
    const g = pts.map(([x, z]) => imgToGround(x, z));
    const out: { mid: [number, number]; len: number; rot: number }[] = [];
    for (let i = 0; i < g.length - 1; i++) {
      const [ax, az] = g[i], [bx, bz] = g[i + 1];
      out.push({ mid: [(ax + bx) / 2, (az + bz) / 2], len: Math.hypot(bx - ax, bz - az) + width * 0.5, rot: -Math.atan2(bz - az, bx - ax) });
    }
    return out;
  }, [pts, width]);
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

/** Static parked cars (context only), instanced. */
function ParkedCars() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cabRef = useRef<THREE.InstancedMesh>(null);
  const slots = useMemo(() => {
    const out: [number, number][] = [];
    const cols = [0.585, 0.635, 0.715, 0.765, 0.84, 0.885, 0.95];
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const cx of cols) {
      for (let y = 0.06; y < 0.95; y += 0.055) {
        if (rnd() < 0.3) continue; // empty bays
        out.push(imgToGround(cx, y));
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    slots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.35, z);
      ref.current?.setMatrixAt(i, m);
      m.makeTranslation(x, 0.78, z);
      cabRef.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (cabRef.current) cabRef.current.instanceMatrix.needsUpdate = true;
  }, [slots]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, slots.length]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.5, 0.85]} />
        <meshStandardMaterial color="#475569" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={cabRef} args={[undefined, undefined, slots.length]}>
        <boxGeometry args={[0.85, 0.36, 0.78]} />
        <meshStandardMaterial color="#64748b" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function Tree({ x, y, r = 1 }: { x: number; y: number; r?: number }) {
  const [gx, gz] = imgToGround(x, y);
  return (
    <group position={[gx, 0, gz]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1.2, 6]} />
        <meshStandardMaterial color="#4b3621" />
      </mesh>
      <mesh position={[0, 1.6 * r, 0]} castShadow>
        <sphereGeometry args={[0.9 * r, 10, 8]} />
        <meshStandardMaterial color="#2f5d3a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Site() {
  const select = useStore((s) => s.select);
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const kw = KX1 - KX0, kd = KZ1 - KZ0, kcx = (KX0 + KX1) / 2, kcz = (KZ0 + KZ1) / 2;
  const [rx0] = imgToGround(0.17, 0), [rx1] = imgToGround(0.33, 0);
  const [px0, pz0] = imgToGround(0.555, 0.02), [px1, pz1] = imgToGround(0.99, 0.98);
  return (
    <group>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => select(null)}>
        <planeGeometry args={[70, 50]} />
        <meshStandardMaterial color="#111a2b" roughness={1} />
      </mesh>
      {/* road on the west */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(rx0 + rx1) / 2, 0.005, 0]} receiveShadow>
        <planeGeometry args={[rx1 - rx0, D + 6]} />
        <meshStandardMaterial color="#1c2433" roughness={1} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[(rx0 + rx1) / 2, 0.02, -D / 2 - 2 + i * 2.5]}>
          <boxGeometry args={[0.1, 0.01, 1.2]} />
          <meshBasicMaterial color="#e2e8f0" />
        </mesh>
      ))}
      {/* parking lot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(px0 + px1) / 2, 0.006, (pz0 + pz1) / 2]} receiveShadow>
        <planeGeometry args={[px1 - px0, pz1 - pz0]} />
        <meshStandardMaterial color="#182132" roughness={1} />
      </mesh>
      <ParkedCars />
      {/* drive-through lane */}
      <Strip pts={LANE_IMG} width={2.9} y={0.012} color="#64748b" />
      <Strip pts={LANE_IMG} width={2.5} y={0.02} color="#1f2937" />
      <Strip pts={LANE_IMG} width={2.3} y={0.03} color="#f59e0b" opacity={0.16} />
      {/* kiosk */}
      <mesh position={[kcx, 1.5, kcz]} castShadow receiveShadow>
        <boxGeometry args={[kw, 3, kd]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      <mesh position={[kcx, 3.15, kcz]} castShadow>
        <boxGeometry args={[kw + 0.6, 0.3, kd + 0.6]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.7} />
      </mesh>
      {[0.55, 0.72].map((fy, i) => {
        const [, wz] = imgToGround(0, fy);
        return (
          <mesh key={i} position={[KX1 + 0.03, 1.4, wz]}>
            <boxGeometry args={[0.06, 1.1, 1.6]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.35} />
          </mesh>
        );
      })}
      {/* trees */}
      {[[0.46, 0.13], [0.42, 0.33, 1.3], [0.45, 0.24], [0.36, 0.92, 1.4], [0.33, 0.8], [0.62, 0.78], [0.54, 0.93], [0.71, 0.86, 1.2], [0.94, 0.75, 1.6], [0.81, 0.04]].map(([x, y, r], i) => (
        <Tree key={i} x={x} y={y} r={r} />
      ))}
      {showZoneLabels && (
        <>
          <Label position={[kcx, 4, kcz]} className="tw-label-muted">Kiosk</Label>
          <Label position={[imgToGround(0.535, 0.3)[0] + 0.5, 0.4, imgToGround(0, 0.3)[1]]} className="tw-label-zone">
            <span className="tw-swatch" style={{ background: "#f59e0b" }} />Drive-through lane
          </Label>
          <Label position={[(rx0 + rx1) / 2, 0.4, -D / 2 + 1]} className="tw-label-muted">Road</Label>
          <Label position={[(px0 + px1) / 2, 1.6, pz0 - 0.5]} className="tw-label-muted">Parking (static context)</Label>
        </>
      )}
    </group>
  );
}

function AerialVehicle({ s, selected }: { s: TrackState; selected: boolean }) {
  const select = useStore((st) => st.select);
  const ref = useRef<THREE.Group>(null);
  const b = s.bbox!;
  const [tx, tz] = imgToGround((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  const init = useRef<[number, number, number]>([tx, 0, tz]);
  const wheels = useRef<(THREE.Object3D | null)[]>([]);
  useSmoothMotion(ref, tx, tz, "velocity", wheels);
  return (
    <group ref={ref} position={init.current} 
      onClick={(e) => { e.stopPropagation(); select(selected ? null : s.track.id); }} {...pointerHandlers}>
      <VehicleMesh s={s} selected={selected} showLabel wheels={wheels} />
    </group>
  );
}

function Scene({ controls }: { controls: React.MutableRefObject<ControlsLike | null> }) {
  const selectedId = useStore((s) => s.selectedTrackId);
  const { now } = useDerived();
  const vehicles = now.filter((s) => s.track.cls === "vehicle" && s.bbox != null);
  return (
    <>
      <SceneLights shadowExtent={28} />
      <Site />
      {vehicles.map((s) => <AerialVehicle key={s.track.id} s={s} selected={s.track.id === selectedId} />)}
      <OrbitControls ref={controls as never} makeDefault target={CAM_TARGET.toArray() as [number, number, number]}
        enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.1} minDistance={8} maxDistance={90} />
    </>
  );
}

export function AerialTwin3D() {
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
      <Canvas shadows dpr={[1, 2]} camera={{ position: CAM_POS.toArray() as [number, number, number], fov: 35, near: 0.1, far: 250 }}>
        <Scene controls={controls} />
      </Canvas>
      <div className="tw-overlay tw-overlay-tl">
        <span className="tw-badge tw-badge-schematic">SCHEMATIC</span>
        <span className="tw-badge tw-badge-warn">FRAME-LOCAL POSITION (CAMERA DRIFTS)</span>
      </div>
      <div className="tw-overlay tw-overlay-tr">
        <button className="tw-btn" onClick={reset}>Reset view</button>
      </div>
    </div>
  );
}

export default AerialTwin3D;
