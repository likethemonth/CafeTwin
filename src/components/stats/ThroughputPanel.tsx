// Cumulative observed exits. Visual idea from WareTwin's Throughput chart (MIT, Wayne Chou).
import { useState } from "react";
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import { Panel } from "../panels/LeftPanels";
import { useDerivedFull, useDuration, useIsSynthetic } from "./common";

const KEY = "lanetwin-target-rate";
function loadRate(): number {
  try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && v > 0 ? v : 1; } catch { return 1; }
}

export function ThroughputPanel() {
  const d = useDerived();
  const full = useDerivedFull();
  const synthetic = useIsSynthetic();
  const t = useStore((s) => s.times[s.sourceId]) ?? 0;
  const seek = useStore((s) => s.seek);
  const dur = useDuration();
  const [rate, setRate] = useState(loadRate);
  const setR = (v: number) => { setRate(v); try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ } };

  const m = d.metrics;
  const from = full.metrics.analysedFrom, to = full.metrics.analysedTo;
  const firstExit = new Map<string, number>();
  for (const e of full.events) if (e.kind === "exit_crossed" && e.trackId && !firstExit.has(e.trackId)) firstExit.set(e.trackId, e.t);
  const exitTimes = [...firstExit.values()].sort((a, b) => a - b);
  const exitsNow = exitTimes.filter((x) => x <= t + 1e-3).length;
  const analysedS = from != null && to != null ? Math.min(t, to) - from : null;
  const hasData = m.sampleCount > 0 && from != null;

  const W = 300, H = 110, P = 18;
  const maxY = Math.max(1, exitTimes.length, from != null && to != null ? rate * (to - from) / 60 : 0);
  const x = (v: number) => P + (v / dur) * (W - P * 2);
  const y = (c: number) => H - P - (c / maxY) * (H - P * 2);
  let path = "";
  if (from != null && to != null) {
    path = `M${x(from)},${y(0)}`;
    let c = 0;
    for (const e of exitTimes) { path += ` H${x(e)} V${y(++c)}`; }
    path += ` H${x(to)}`;
  }
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    seek(Math.min(dur, Math.max(0, ((sx - P) / (W - P * 2)) * dur)));
  };
  const ratePerMin = analysedS && analysedS > 0 && exitsNow >= 1 ? (exitsNow / analysedS) * 60 : null;

  return (
    <Panel title="Throughput" sub={synthetic ? "synthetic data" : "observed exits"}>
      {!hasData ? <div className="muted st-empty">No analysed samples — throughput unknown (—).</div> : (
        <div className="st-col">
          <div className="st-head">
            <span className="st-big num">{exitsNow}</span>
            <span className="muted"> exits / <span className="num">{analysedS != null && analysedS >= 0 ? analysedS.toFixed(1) : "—"}</span> s analysed</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="st-svg" preserveAspectRatio="none" onClick={onClick}>
            <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--border)" />
            <line x1={P} x2={W - P} y1={y(maxY)} y2={y(maxY)} stroke="var(--border)" />
            <text x={P - 3} y={y(maxY) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{maxY.toFixed(maxY % 1 ? 1 : 0)}</text>
            <text x={P - 3} y={y(0) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">0</text>
            {from != null && to != null && <rect x={x(from)} y={P / 2} width={Math.max(0, x(to) - x(from))} height={H - P * 1.5} fill="rgba(34,211,238,.06)" />}
            {from != null && to != null && (
              <line x1={x(from)} y1={y(0)} x2={x(to)} y2={y(rate * (to - from) / 60)} stroke="#fbbf24" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            <line x1={x(t)} x2={x(t)} y1={P / 2} y2={H - P} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={P} y={H - 4} fontSize="8" fill="var(--muted)">0s</text>
            <text x={W - P} y={H - 4} fontSize="8" fill="var(--muted)" textAnchor="end">{dur.toFixed(1)}s</text>
          </svg>
          <div className="st-foot">
            <label>target <input type="number" min={0.1} step={0.1} value={rate} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setR(v); }} />/min <span className="st-dash" /></label>
            <span>{ratePerMin != null ? <>≈<span className="num">{ratePerMin.toFixed(1)}</span>/min (extrapolated from {analysedS!.toFixed(1)} s — indicative only)</> : "rate: — (no observed exit yet)"}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
