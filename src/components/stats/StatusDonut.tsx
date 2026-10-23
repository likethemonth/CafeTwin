// Track status breakdown. Donut style adapted from WareTwin's Robot status panel (MIT, Wayne Chou).
import { useDerived } from "../../logic/derive";
import { useStore } from "../../store";
import { Panel } from "../panels/LeftPanels";
import { useIsSynthetic } from "./common";

const CATS = [
  { key: "queue", label: "In queue", color: "#38bdf8" },
  { key: "order", label: "At order window", color: "#a78bfa" },
  { key: "pickup", label: "At pickup", color: "#34d399" },
  { key: "exited", label: "Exited (seen)", color: "#f472b6" },
  { key: "lost", label: "Lost (no exit)", color: "#5b6778" },
  { key: "unmapped", label: "Unmapped/uncert.", color: "#fbbf24" },
] as const;
type Key = (typeof CATS)[number]["key"];

export function StatusDonut() {
  const d = useDerived();
  const zones = useStore((s) => s.zones);
  const synthetic = useIsSynthetic();
  const counts: Record<Key, number> = { queue: 0, order: 0, pickup: 0, exited: 0, lost: 0, unmapped: 0 };
  for (const tr of d.tracks) {
    const st = d.now.find((x) => x.track.id === tr.id);
    let k: Key;
    if (tr.exited) k = "exited";
    else if (!st || st.stale) k = "lost";
    else {
      const role = st.zoneId ? zones.find((z) => z.id === st.zoneId)?.role : undefined;
      k = tr.uncertain || !role ? "unmapped" : role === "queue" ? "queue" : role === "order" ? "order" : role === "pickup" ? "pickup" : "unmapped";
    }
    counts[k]++;
  }
  const total = d.tracks.length;
  const R = 34, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <Panel title="Track status" sub={synthetic ? "synthetic data" : "observed, up to now"}>
      {total === 0 ? <div className="muted st-empty">No tracks observed yet — status unknown (—).</div> : (
        <div className="st-donut">
          <svg viewBox="0 0 90 90" width="84" height="84">
            <circle cx="45" cy="45" r={R} fill="none" stroke="var(--panel-2)" strokeWidth="11" />
            {CATS.map((c) => {
              const n = counts[c.key];
              if (!n) return null;
              const len = (n / total) * C;
              const el = <circle key={c.key} cx="45" cy="45" r={R} fill="none" stroke={c.color} strokeWidth="11"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 45 45)" />;
              acc += len;
              return el;
            })}
            <text x="45" y="47" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)" className="num">{total}</text>
            <text x="45" y="59" textAnchor="middle" fontSize="7" fill="var(--muted)">tracks</text>
          </svg>
          <div className="st-legend">
            {CATS.map((c) => (
              <div key={c.key} className={counts[c.key] ? "" : "faint"}>
                <i style={{ background: c.color }} />
                <span>{c.label}</span>
                <b className="num">{counts[c.key]}</b>
                <span className="num muted">{Math.round((counts[c.key] / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
