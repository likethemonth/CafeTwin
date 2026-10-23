// Observed dwell per zone (closed visits + open visits up to now).
import { useDerived } from "../../logic/derive";
import { useStore } from "../../store";
import { Panel } from "../panels/LeftPanels";

export function ZoneDwellBars() {
  const d = useDerived();
  const allZones = useStore((s) => s.zones);
  const sourceId = useStore((s) => s.sourceId);
  const zones = allZones.filter((z) => z.sourceId === sourceId && z.role !== "exit");
  const target = useStore((s) => s.settings.waitTargetS);
  const t = useStore((s) => s.times[s.sourceId]) ?? 0;
  const rows = zones.map((z) => {
    const ds: number[] = [];
    for (const tr of d.tracks) for (const v of tr.zoneHistory) if (v.zoneId === z.id) ds.push((v.exitT ?? Math.min(t, tr.lastT)) - v.enterT);
    return { z, n: ds.length, avg: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null, max: ds.length ? Math.max(...ds) : null };
  });
  const scale = Math.max(target * 1.25, ...rows.map((r) => r.max ?? 0), 1);
  const pct = (v: number) => `${(v / scale) * 100}%`;
  return (
    <Panel title="Zone dwell" sub={`avg / max observed · target ${target}s`}>
      {rows.length === 0 ? <div className="muted st-empty">No zones for this source.</div> : (
        <div className="st-bars">
          {rows.map((r) => (
            <div key={r.z.id} className="st-bar">
              <div className="st-bar-l"><span>{r.z.name.split(" (")[0]}</span><span className="num muted">{r.avg == null ? "—" : `${r.avg.toFixed(1)} / ${r.max!.toFixed(1)} s`} · n={r.n}</span></div>
              <div className="st-bar-t">
                {r.max != null && <div className="st-bar-max" style={{ width: pct(r.max), background: r.z.color }} />}
                {r.avg != null && <div className="st-bar-avg" style={{ width: pct(r.avg), background: r.z.color }} />}
                <div className="st-bar-tgt" style={{ left: pct(target) }} title={`target ${target}s`} />
              </div>
            </div>
          ))}
          <div className="assume">Solid = average, faded = max. Open visits counted up to now. Dashed line = wait target.</div>
        </div>
      )}
    </Panel>
  );
}
