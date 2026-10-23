import { useEffect, useState } from "react";
import { create } from "zustand";
import { useStore } from "../../store";
import type { ZoneRole } from "../../types";

interface ZoneDraftState {
  active: boolean;
  points: [number, number][];
  closed: boolean;
  setActive: (a: boolean) => void;
  addPoint: (p: [number, number]) => void;
  close: () => void;
  reset: () => void;
}

/** Shared draft state read by VideoPanel to route overlay clicks into the editor. */
export const useZoneDraft = create<ZoneDraftState>()((set) => ({
  active: false,
  points: [],
  closed: false,
  setActive: (a) => set({ active: a, points: [], closed: false }),
  addPoint: (p) => set((s) => (s.closed ? s : { points: [...s.points, p] })),
  close: () => set((s) => (s.points.length >= 3 ? { closed: true } : s)),
  reset: () => set({ points: [], closed: false }),
}));

const ROLES: ZoneRole[] = ["queue", "order", "pickup", "exit", "staff"];
const ROLE_COLORS: Record<ZoneRole, string> = {
  queue: "#38bdf8",
  order: "#a78bfa",
  pickup: "#34d399",
  exit: "#f472b6",
  staff: "#fbbf24",
};


export function ZoneEditor({ embedded = false }: { embedded?: boolean }) {
  const sourceId = useStore((s) => s.sourceId);
  const zones = useStore((s) => s.zones);
  const playing = useStore((s) => s.playing);
  const upsertZone = useStore((s) => s.upsertZone);
  const deleteZone = useStore((s) => s.deleteZone);
  const { active, points, closed, setActive, close, reset } = useZoneDraft();
  const [name, setName] = useState("");
  const [role, setRole] = useState<ZoneRole>("queue");

  // Draft vertices belong to one recording and must not survive closing the editor.
  useEffect(() => () => setActive(false), [sourceId, setActive]);

  const sourceZones = zones.filter((z) => z.sourceId === sourceId);

  const save = () => {
    if (!closed || points.length < 3) return;
    upsertZone({
      id: `z-${Date.now()}`,
      sourceId,
      name: name.trim() || `Zone ${sourceZones.length + 1}`,
      role,
      points,
      color: ROLE_COLORS[role],
    });
    setName("");
    reset();
  };

  return (
    <div className={`vp-card vp-zone-editor${embedded ? " vp-embedded" : ""}`}>
      <div className="vp-card-head">
        {!embedded && <span className="vp-card-title">Zones</span>}
        <button className={`vp-btn ${active ? "vp-btn-active" : ""}`} onClick={() => setActive(!active)}>
          {active ? "Exit edit mode" : "Edit zones"}
        </button>
      </div>

      {active && (
        <div className="vp-zone-draft">
          {playing ? (
            <p className="vp-hint">Pause the video to place vertices.</p>
          ) : (
            <p className="vp-hint">
              Click on the video to add vertices. <span className="vp-num">{points.length}</span> placed
              {closed ? " · closed" : ""}.
            </p>
          )}
          <div className="vp-row">
            <button className="vp-btn" disabled={points.length < 3 || closed} onClick={close}>
              Close polygon
            </button>
            <button className="vp-btn" disabled={points.length === 0} onClick={reset}>
              Cancel
            </button>
          </div>
          <div className="vp-row">
            <input
              className="vp-input"
              placeholder="Zone name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select className="vp-input" value={role} onChange={(e) => setRole(e.target.value as ZoneRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="vp-btn vp-btn-primary" disabled={!closed} onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}

      <ul className="vp-zone-list">
        {sourceZones.length === 0 && <li className="vp-hint">No zones for this source.</li>}
        {sourceZones.map((z) => (
          <li key={z.id} className="vp-zone-item">
            <span className="vp-swatch" style={{ background: z.color }} />
            <span className="vp-zone-name">{z.name}</span>
            <span className="vp-tag">{z.role}</span>
            <button className="vp-btn vp-btn-small" onClick={() => deleteZone(z.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ZoneEditor;
