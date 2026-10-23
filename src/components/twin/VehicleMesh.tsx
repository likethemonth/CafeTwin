// Shared vehicle mesh + small scene helpers for LaneTwin 3D views.
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { useStore } from "../../store";
import type { TrackState } from "../../logic/contract";
import { SELECTED_COLOR, STATUS_COLOR } from "./lane";
import { vehiclePaint } from "../../logic/appearance";

export function statusColor(s: TrackState): string {
  if (s.stale || s.track.uncertain) return STATUS_COLOR.stale;
  return STATUS_COLOR[s.status] ?? STATUS_COLOR.uncertain;
}

/** Simple schematic car body at local origin, facing +x. */
export function VehicleMesh({ s, selected, showLabel, color, opacity, wheels }: {
  s: TrackState; selected: boolean; showLabel: boolean; color?: string; opacity?: number;
  wheels?: MutableRefObject<(THREE.Object3D | null)[]>;
}) {
  const c = color ?? vehiclePaint(s);
  const op = opacity ?? (s.estimated || s.stale ? 0.5 : 1);
  const transparent = op < 1;
  return (
    <>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[2.0, 0.55, 1.0]} />
        <meshStandardMaterial color={c} transparent={transparent} opacity={op}
          metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-0.15, 0.98, 0]} castShadow>
        <boxGeometry args={[1.05, 0.42, 0.9]} />
        <meshStandardMaterial color="#52606b" transparent={transparent} opacity={op * 0.9} />
      </mesh>
      {[[0.62, 0.52], [0.62, -0.52], [-0.62, 0.52], [-0.62, -0.52]].map(([x, z], i) => (
        <group key={i} position={[x, 0.22, z]} ref={(o) => { if (wheels) wheels.current[i] = o; }}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.14, 12]} />
            <meshStandardMaterial color="#0f172a" transparent={transparent} opacity={op} />
          </mesh>
          {/* hub marker so spin is visible */}
          <mesh position={[0.12, 0, 0]}>
            <boxGeometry args={[0.08, 0.06, 0.16]} />
            <meshStandardMaterial color="#94a3b8" transparent={transparent} opacity={op} />
          </mesh>
        </group>
      ))}
      {selected && (
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[2.3, 1.2, 1.3]} />
          <meshBasicMaterial color={SELECTED_COLOR} wireframe />
        </mesh>
      )}
      {showLabel && <TrackLabel s={s} selected={selected} color={statusColor(s)} y={1.8} />}
    </>
  );
}

export function TrackLabel({ s, selected, color, y }: { s: TrackState; selected: boolean; color: string; y: number }) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div className={`tw-veh-label${selected ? " tw-veh-label-sel" : ""}`} style={{ borderColor: selected ? SELECTED_COLOR : color }}>
        {s.track.id}
        {s.dwellS != null && <span className="tw-mono"> {s.dwellS.toFixed(1)}s</span>}
        {s.estimated && <span className="tw-dim"> est</span>}
      </div>
    </Html>
  );
}

export function Label({ position, children, className = "" }: { position: [number, number, number]; children: ReactNode; className?: string }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className={`tw-label ${className}`}>{children}</div>
    </Html>
  );
}

/** Standard dark-navy lighting rig shared by the 3D twins. */
export function SceneLights({ shadowExtent = 20 }: { shadowExtent?: number }) {
  return (
    <>
      <color attach="background" args={["#0b1220"]} />
      <fog attach="fog" args={["#0b1220", 45, 110]} />
      <ambientLight intensity={0.45} color="#b9c6e0" />
      <hemisphereLight args={["#9db4e0", "#1a2233", 0.5]} />
      <directionalLight position={[12, 25, 10]} intensity={1.5} color="#e8eefc" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent} shadow-bias={-0.0004} />
    </>
  );
}

export const pointerHandlers = {
  onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
  onPointerOut: () => { document.body.style.cursor = ""; },
};

export const WHEEL_R = 0.22;
/** Store-time jump (s) above which motion snaps instead of easing (seek). */
const SNAP_JUMP_S = 1.5;

/**
 * Per-frame damped motion toward the latest derived target. Snaps on first mount and on
 * seeks (large jumps in store time); eases otherwise, so paused playback comes to rest.
 * yaw: explicit goal heading (rotation.y), or "velocity" to face the direction of travel.
 * Wheels spin proportional to distance moved.
 */
export function useSmoothMotion(
  ref: RefObject<THREE.Group>,
  tx: number,
  tz: number,
  yaw: number | "velocity" | null,
  wheels?: MutableRefObject<(THREE.Object3D | null)[]>,
) {
  const lastT = useRef<number | null>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const st = useStore.getState();
    const t = st.times[st.sourceId];
    const jumped = lastT.current != null && Math.abs(t - lastT.current) > SNAP_JUMP_S;
    lastT.current = t;
    const k = jumped || !st.playing ? 1 : 1 - Math.pow(0.004, Math.min(dt, 0.1));
    const dx = (tx - g.position.x) * k, dz = (tz - g.position.z) * k;
    g.position.x += dx;
    g.position.z += dz;
    const step = Math.hypot(dx, dz);
    let goal: number | null = typeof yaw === "number" ? yaw : null;
    if (yaw === "velocity" && !jumped && Math.hypot(tx - g.position.x, tz - g.position.z) > 0.05) {
      goal = -Math.atan2(tz - g.position.z, tx - g.position.x);
    }
    if (goal != null) {
      let diff = goal - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += jumped ? diff : diff * (1 - Math.pow(0.02, Math.min(dt, 0.1)));
    }
    if (wheels && !jumped && step > 1e-5) {
      for (const w of wheels.current) if (w) w.rotation.z -= step / WHEEL_R;
    }
  });
}
