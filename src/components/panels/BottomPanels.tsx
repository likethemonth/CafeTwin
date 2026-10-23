// Journey table, queue chart, timeline scrubber. Adapted from WareTwin BottomPanels (MIT, Wayne Chou).
import { useRef } from "react";
import type { PointerEvent as RPE } from "react";
import { SOURCES, activeObservations, useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import { fmtClock } from "../shell/Header";
import { Panel, fmtS } from "./LeftPanels";

export function JourneyTable() {
  const d = useDerived();
  const selId = useStore((s) => s.selectedTrackId);
  const select = useStore((s) => s.select);
  const zones = useStore((s) => s.zones);
  const zname = (id: string) => zones.find((z) => z.id === id)?.name.split(" ")[0] ?? id;
  return (
    <Panel title="Vehicle journeys" sub={`${d.tracks.length} tracks`}>
      {d.tracks.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No tracks yet — analyse a segment.</div> : (
        <table className="lt">
          <thead><tr><th>ID</th><th>Class</th><th>First</th><th>Last</th><th>Zones</th><th>Dwell</th><th>Status</th><th>End</th></tr></thead>
          <tbody>
            {d.tracks.map((tr) => {
              const st = d.now.find((x) => x.track.id === tr.id);
              return (
                <tr key={tr.id} className={"row" + (tr.id === selId ? " sel" : "")} onClick={() => select(tr.id)}>
                  <td className="num">{tr.id}{tr.uncertain ? " ?" : ""}</td>
                  <td>{tr.cls}</td>
                  <td className="num">{tr.presentAtStart ? "at start" : fmtClock(tr.firstT)}</td>
                  <td className="num">{fmtClock(tr.lastT)}</td>
                  <td>{tr.zoneHistory.map((v) => zname(v.zoneId)).join(" → ") || "—"}</td>
                  <td className="num">{fmtS(st?.dwellS ?? null)}</td>
                  <td style={{ color: st?.status === "red" ? "var(--red)" : st?.status === "amber" ? "var(--yellow)" : undefined }}>{st ? (st.stale ? "stale" : st.status) : "—"}</td>
                  <td>{tr.exited ? "exited" : st?.stale || !st ? "lost" : "in view"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function QueueChart() {
  const d = useDerived();
  const sourceId = useStore((s) => s.sourceId);
  const t = useStore((s) => s.times[s.sourceId]);
  const seek = useStore((s) => s.seek);
  const dur = SOURCES.find((s) => s.id === sourceId)?.durationS ?? 1;
  const series = d.metrics.queueSeries;
  const W = 300, H = 120, P = 18;
  const maxC = Math.max(1, ...series.map((p) => p.count));
  const x = (v: number) => P + (v / dur) * (W - P * 2);
  const y = (c: number) => H - P - (c / maxC) * (H - P * 2);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    seek(Math.min(dur, Math.max(0, ((sx - P) / (W - P * 2)) * dur)));
  };
  return (
    <Panel title="Queue length" sub="analysed samples">
      {series.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No analysed samples — queue unknown (not zero).</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", cursor: "pointer" }} preserveAspectRatio="none" onClick={onClick}>
          {[0, maxC].map((c) => (
            <g key={c}>
              <line x1={P} x2={W - P} y1={y(c)} y2={y(c)} stroke="var(--border)" />
              <text x={P - 4} y={y(c) + 3} fontSize="9" fill="var(--muted)" textAnchor="end">{c}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {series.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.count)} r={2} fill="var(--accent)" />)}
          <line x1={x(t)} x2={x(t)} y1={P / 2} y2={H - P} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={P} y={H - 4} fontSize="9" fill="var(--muted)">0s</text>
          <text x={W - P} y={H - 4} fontSize="9" fill="var(--muted)" textAnchor="end">{dur.toFixed(1)}s</text>
        </svg>
      )}
    </Panel>
  );
}

const EV_COLOR: Record<string, string> = {
  wait_exceeded: "var(--red)", exit_crossed: "#f472b6", track_lost: "var(--faint)",
  candidate_contact: "var(--yellow)", confirmed_contact: "var(--green)",
};

export function Timeline() {
  const d = useDerived();
  const sourceId = useStore((s) => s.sourceId);
  const t = useStore((s) => s.times[s.sourceId]);
  const obs = useStore(activeObservations);
  const seek = useStore((s) => s.seek);
  const dur = SOURCES.find((s) => s.id === sourceId)?.durationS ?? 1;
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const sampleTs = Object.values(obs ?? {}).map((o) => o.t);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / dur) * 100))}%`;
  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    seek(Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur)));
  };
  const down = (e: RPE<HTMLDivElement>) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e.clientX); };
  const move = (e: RPE<HTMLDivElement>) => { if (dragging.current) at(e.clientX); };
  const up = () => { dragging.current = false; };
  const m = d.metrics;
  return (
    <div className="timeline">
      <div className="tl-head">
        <span>Timeline · <span className="num">{sampleTs.length}</span> analysed samples · {d.events.length} events</span>
        <span className="num">{fmtClock(t)} / {fmtClock(dur)}</span>
      </div>
      <div className="track" ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {m.analysedFrom != null && m.analysedTo != null && (
          <div className="cov" style={{ left: pct(m.analysedFrom), width: `calc(${pct(m.analysedTo)} - ${pct(m.analysedFrom)})` }} />
        )}
        {sampleTs.map((s) => <div key={s} className="tick" style={{ left: pct(s) }} title={`sample ${s.toFixed(2)}s`} />)}
        {d.events.filter((e) => e.kind !== "zone_entered" && e.kind !== "zone_exited" && e.kind !== "first_observed").map((e) => (
          <div key={e.id} className="evm" style={{ left: pct(e.t), background: EV_COLOR[e.kind] ?? "var(--muted)" }} title={e.message} />
        ))}
        <div className="cursor" style={{ left: pct(t) }} />
      </div>
    </div>
  );
}
