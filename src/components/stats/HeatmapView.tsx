// Occupancy heatmap + traffic polylines over the camera frame.
// Concept adapted from WareTwin's MapView2D heatmap/traffic views (MIT, Wayne Chou).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SOURCES, useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import { useIsSynthetic } from "./common";

const GX = 32, GY = 18;
function ramp(v: number): string {
  // blue -> green -> yellow -> red
  const stops = [[59, 130, 246], [34, 197, 94], [250, 204, 21], [239, 68, 68]];
  const x = Math.min(0.999, Math.max(0, v)) * (stops.length - 1);
  const i = Math.floor(x), k = x - i;
  const c = stops[i].map((a, j) => Math.round(a + (stops[i + 1][j] - a) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function HeatmapView({ mode }: { mode: "heatmap" | "traffic" }) {
  const d = useDerived();
  const synthetic = useIsSynthetic();
  const sourceId = useStore((s) => s.sourceId);
  const t = useStore((s) => s.times[s.sourceId]) ?? 0;
  const allZones = useStore((s) => s.zones);
  const select = useStore((s) => s.select);
  const selId = useStore((s) => s.selectedTrackId);
  const src = SOURCES.find((s) => s.id === sourceId)!;
  const zones = allZones.filter((z) => z.sourceId === sourceId);
  const W = src.width, H = src.height;

  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H);
      setBox({ w: Math.floor(W * s), h: Math.floor(H * s) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = vid.current;
    if (v && Math.abs(v.currentTime - t) > 0.05) { try { v.currentTime = t; } catch { /* not ready */ } }
  }, [t, src.url]);

  // Observed samples only (estimated/interpolated samples excluded).
  const grid = new Array(GX * GY).fill(0);
  let n = 0;
  for (const tr of d.tracks) for (const s of tr.samples) {
    if (s.estimated) continue;
    const cx = (s.bbox[0] + s.bbox[2]) / 2, cy = s.bbox[3];
    const gx = Math.min(GX - 1, Math.floor(cx * GX)), gy = Math.min(GY - 1, Math.floor(cy * GY));
    grid[gy * GX + gx]++; n++;
  }
  const max = Math.max(1, ...grid);
  const cw = W / GX, ch = H / GY;

  return (
    <div className="st-heat">
      <div className="st-heat-stage" ref={wrap}>
        <div className="st-heat-box" style={{ width: box.w, height: box.h }}>
          <video ref={vid} src={src.url} muted playsInline preload="auto" className="st-heat-vid"
            onLoadedMetadata={(e) => { try { e.currentTarget.currentTime = t; } catch { /* ignore */ } }} />
          <svg viewBox={`0 0 ${W} ${H}`} className="st-heat-svg">
            {mode === "heatmap" && grid.map((c, i) => c ? (
              <rect key={i} x={(i % GX) * cw} y={Math.floor(i / GX) * ch} width={cw} height={ch}
                fill={ramp(c / max)} fillOpacity={0.25 + 0.5 * (c / max)}><title>{c} observed samples</title></rect>
            ) : null)}
            {zones.map((z) => (
              <g key={z.id}>
                <polygon points={z.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none" stroke={z.color} strokeWidth={1.5} strokeDasharray="5 3" />
                <text x={z.points[0][0] * W + 3} y={z.points[0][1] * H - 4} fontSize="11" fill={z.color}>{z.name}</text>
              </g>
            ))}
            {mode === "traffic" && d.tracks.map((tr) => {
              const pts = tr.samples.filter((s) => !s.estimated).map((s) => [((s.bbox[0] + s.bbox[2]) / 2) * W, s.bbox[3] * H]);
              if (!pts.length) return null;
              const col = tr.exited ? "#f472b6" : tr.cls === "person" ? "#fbbf24" : "#22d3ee";
              const last = pts[pts.length - 1];
              const sel = tr.id === selId;
              return (
                <g key={tr.id} style={{ cursor: "pointer" }} onClick={() => select(tr.id)}>
                  <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={col} strokeWidth={sel ? 3 : 2} strokeDasharray="6 4" opacity={0.9} />
                  {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={col} />)}
                  <rect x={last[0] + 4} y={last[1] - 16} width={tr.id.length * 7 + 8} height={14} rx={3} fill="rgba(7,11,19,.85)" stroke={col} />
                  <text x={last[0] + 8} y={last[1] - 6} fontSize="10" fill={col} fontFamily="monospace">{tr.id}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="st-heat-bar">
        {mode === "heatmap" ? (
          <span className="st-ramp-l">Observed density <span className="muted">LOW</span><span className="st-ramp" /><span className="muted">HIGH</span></span>
        ) : (
          <span className="st-ramp-l"><i style={{ background: "#22d3ee" }} />vehicle <i style={{ background: "#fbbf24" }} />person <i style={{ background: "#f472b6" }} />exited · dashed = observed bottom-centre path</span>
        )}
        <span className="muted">
          {n ? <><span className="num">{n}</span> observed samples · {d.tracks.length} tracks · analysed {d.metrics.analysedFrom?.toFixed(1) ?? "—"}–{Math.min(t, d.metrics.analysedTo ?? t).toFixed(1)} s</> : "No observed samples up to now — density unknown"}
        </span>
        {synthetic && <span className="prov synthetic">synthetic</span>}
      </div>
    </div>
  );
}
