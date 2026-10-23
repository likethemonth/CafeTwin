// Left sidebar KPIs + alerts. Panel primitive adapted from WareTwin ui/primitives (MIT, Wayne Chou).
import type { CSSProperties, ReactNode } from "react";
import { SOURCES, useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import { fmtClock } from "../shell/Header";

export function Panel({ title, sub, action, children, grow, style }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; grow?: boolean; style?: CSSProperties }) {
  return (
    <section className={"panel" + (grow ? " grow" : "")} style={style}>
      <header className="panel-h">
        <span>{title}{sub && <span className="sub">{sub}</span>}</span>
        {action}
      </header>
      <div className="panel-b">{children}</div>
    </section>
  );
}

/** format seconds; null stays "—" (never 0) */
export function fmtS(v: number | null | undefined, d = 1): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)} s`;
}
export const dash = (v: number | null | undefined) => (v == null ? "—" : String(v));

export function LeftPanels() {
  const d = useDerived();
  const m = d.metrics;
  const sourceId = useStore((s) => s.sourceId);
  const acked = useStore((s) => s.ackedAlerts);
  const ackAlert = useStore((s) => s.ackAlert);
  const select = useStore((s) => s.select);
  const seek = useStore((s) => s.seek);
  const waitTarget = useStore((s) => s.settings.waitTargetS);
  const src = SOURCES.find((s) => s.id === sourceId);
  const unacked = d.alerts.filter((a) => !acked.includes(a.id));
  const ackedList = d.alerts.filter((a) => acked.includes(a.id));

  return (
    <>
      <Panel title="Operations" sub="observed">
        <div className="kpi">
          <div className="k">Queue count</div>
          <div className="v">{dash(m.queueCount)}</div>
          <div className="s">{m.queueCount == null ? "no analysed frame near now" : "vehicles in queue/order zones"}</div>
        </div>
        <div className="kpi">
          <div className="k">Longest observed wait</div>
          <div className="v" style={{ color: m.longestDwellS != null && m.longestDwellS > waitTarget ? "var(--red)" : undefined }}>{fmtS(m.longestDwellS)}</div>
          <div className="s">
            {m.longestTrackId ? (
              <a className="link" style={{ cursor: "pointer", color: "var(--accent)" }} onClick={() => select(m.longestTrackId)}>{m.longestTrackId}</a>
            ) : "—"} observed waiting for… (target {waitTarget}s)
          </div>
        </div>
        <div className="kpi">
          <div className="k">Completed exits</div>
          <div className="v">{dash(m.completedExits)}</div>
          <div className="s">exit-zone crossings only</div>
        </div>
        <div className="kpi">
          <div className="k">Analysis coverage</div>
          <div className="v" style={{ fontSize: 15 }}>
            {m.analysedFrom == null || m.analysedTo == null ? "—" : `${fmtClock(m.analysedFrom)}–${fmtClock(m.analysedTo)}`}
          </div>
          <div className="s"><span className="num">{m.sampleCount}</span> samples · of {src ? src.durationS.toFixed(1) : "—"} s clip</div>
        </div>
      </Panel>
      <Panel title="Active alerts" sub={`${unacked.length} open`} grow>
        {d.alerts.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No alerts up to current time.</div>}
        {[...unacked, ...ackedList].map((a) => {
          const isAcked = acked.includes(a.id);
          return (
            <div key={a.id} className={"alert-row" + (isAcked ? " acked" : "")} onClick={() => { select(a.trackId); seek(a.t); }}>
              <span className="dot" style={{ background: isAcked ? "var(--faint)" : "var(--red)", marginTop: 4 }} />
              <div className="msg-lt">
                <div>{a.message}</div>
                <div className="muted num" style={{ fontSize: 11 }}>{a.trackId} · {fmtClock(a.t)}</div>
              </div>
              {isAcked ? <span className="muted" style={{ fontSize: 11 }}>acked</span> : (
                <button className="btn xs" onClick={(e) => { e.stopPropagation(); ackAlert(a.id); }}>Ack</button>
              )}
            </div>
          );
        })}
      </Panel>
    </>
  );
}
