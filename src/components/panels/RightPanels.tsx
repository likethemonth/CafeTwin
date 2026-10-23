// Selected-object inspector + event log. Adapted from WareTwin RightPanels (MIT, Wayne Chou).
import { useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import { fmtClock } from "../shell/Header";
import { Panel } from "./LeftPanels";

export function Inspector() {
  const d = useDerived();
  const selId = useStore((s) => s.selectedTrackId);
  const zones = useStore((s) => s.zones);
  const seek = useStore((s) => s.seek);
  const select = useStore((s) => s.select);
  const t = useStore((s) => s.times[s.sourceId]);
  const track = d.tracks.find((x) => x.id === selId) ?? null;
  const state = d.now.find((x) => x.track.id === selId) ?? null;

  if (!track) {
    return <Panel title="Selected object"><div className="muted" style={{ fontSize: 12 }}>Select a vehicle in the twin, footage or journey table.</div></Panel>;
  }
  const zname = (id: string) => zones.find((z) => z.id === id)?.name ?? id;
  const zcol = (id: string) => zones.find((z) => z.id === id)?.color ?? "#64748b";
  const span = Math.max(0.001, track.lastT - track.firstT);
  const pct = (v: number) => `${((v - track.firstT) / span) * 100}%`;
  const evs = d.events.filter((e) => e.trackId === track.id);

  return (
    <Panel title="Selected object" sub={track.id} action={<button className="btn xs" onClick={() => select(null)}>Clear</button>}>
      <div className="kv"><span className="k">Class</span><span className="v">{track.cls}</span></div>
      <div className="kv"><span className="k">First observed</span><span className="v num">{track.presentAtStart ? "arrival unknown (present at start)" : fmtClock(track.firstT)}</span></div>
      <div className="kv"><span className="k">Last observed</span><span className="v num">{fmtClock(track.lastT)}</span></div>
      <div className="kv"><span className="k">Status</span><span className="v">{track.exited ? "exited" : state?.stale ? "lost / stale" : state?.status ?? "—"}</span></div>
      <div className="kv"><span className="k">Uncertainty</span><span className="v">{track.uncertain ? "uncertain track" : "consistent"}{state?.estimated ? " · interpolated now" : ""}</span></div>
      <div className="kv"><span className="k">Provenance</span><span className="v"><span className={"prov " + track.provenance}>{track.provenance}</span></span></div>
      <div className="mini-tl" title="Zone history (track span)">
        {track.zoneHistory.map((v, i) => (
          <div key={i} className="seg" style={{ left: pct(v.enterT), width: `calc(${pct(v.exitT ?? track.lastT)} - ${pct(v.enterT)})`, background: zcol(v.zoneId) }} />
        ))}
        {t >= track.firstT && t <= track.lastT && <div className="cur" style={{ left: pct(t) }} />}
      </div>
      <div style={{ fontSize: 11.5 }}>
        {track.zoneHistory.length === 0 && <div className="muted">No zone visits observed.</div>}
        {track.zoneHistory.map((v, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
            <span className="dot" style={{ background: zcol(v.zoneId) }} />
            <span style={{ flex: 1 }}>{zname(v.zoneId)}</span>
            <span className="num muted">{fmtClock(v.enterT)}–{v.exitT == null ? "…" : fmtClock(v.exitT)}</span>
            <button className="btn xs" onClick={() => seek(v.enterT)}>Jump</button>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Jump to frame (observed samples)</div>
      <div className="jump-list">
        {track.samples.map((s) => (
          <button key={s.t} className="btn xs num" onClick={() => seek(s.t)}>{s.t.toFixed(2)}</button>
        ))}
      </div>
      {evs.length > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Events</div>}
      <div className="jump-list">
        {evs.map((e) => (
          <button key={e.id} className="btn xs" onClick={() => seek(e.t)} title={e.message}>{e.kind.replace(/_/g, " ")} @{e.t.toFixed(1)}</button>
        ))}
      </div>
    </Panel>
  );
}

export function EventLog() {
  const d = useDerived();
  const seek = useStore((s) => s.seek);
  const select = useStore((s) => s.select);
  const reviews = useStore((s) => s.contactReviews);
  const review = useStore((s) => s.reviewContact);
  const evs = [...d.events].sort((a, b) => b.t - a.t).slice(0, 60);
  return (
    <Panel title="Recent events" sub={`${d.events.length}`} grow>
      {evs.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No events up to current time.</div>}
      {evs.map((e) => {
        const r = reviews[e.id];
        return (
          <div key={e.id} className="ev-lt" onClick={() => { seek(e.t); if (e.trackId) select(e.trackId); }}>
            <span className="t">{fmtClock(e.t)}</span>
            <div>
              <div>{e.message}</div>
              {e.kind === "candidate_contact" && (
                <div style={{ display: "flex", gap: 4, marginTop: 3 }} onClick={(ev) => ev.stopPropagation()}>
                  {r ? <span className="muted" style={{ fontSize: 11 }}>{r}</span> : (
                    <>
                      <button className="btn xs primary" onClick={() => review(e.id, "confirmed")}>Confirm</button>
                      <button className="btn xs" onClick={() => review(e.id, "rejected")}>Reject</button>
                    </>
                  )}
                </div>
              )}
            </div>
            <span className={"prov " + e.provenance}>{e.provenance}</span>
          </div>
        );
      })}
    </Panel>
  );
}
