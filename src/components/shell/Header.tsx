// LaneTwin header. Adapted from WareTwin's TopBar (MIT, Wayne Chou).
import { SOURCES, activeObservations, useStore } from "../../store";
import type { SourceId } from "../../types";
import { getVideo } from "../video/videoRegistry";

export function fmtClock(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export function Header() {
  const sourceId = useStore((s) => s.sourceId);
  const setSource = useStore((s) => s.setSource);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const rate = useStore((s) => s.rate);
  const setRate = useStore((s) => s.setRate);
  const t = useStore((s) => s.times[s.sourceId]);
  const obs = useStore(activeObservations);
  const src = SOURCES.find((s) => s.id === sourceId);

  const list = Object.values(obs ?? {});
  const hasModel = list.some((o) => o.provenance === "model");
  const hasSynth = list.some((o) => o.provenance === "synthetic");
  const status = hasModel ? { cls: "analysed", label: "Analysed replay" } : hasSynth ? { cls: "synthetic", label: "Synthetic demo" } : { cls: "replay", label: "Replay" };

  const toggle = () => {
    const v = getVideo();
    if (playing) { v?.pause(); setPlaying(false); }
    else { v?.play().catch(() => setPlaying(false)); setPlaying(true); }
  };
  const changeRate = (r: number) => {
    setRate(r);
    const v = getVideo();
    if (v) v.playbackRate = r;
  };

  return (
    <header className="topbar">
      <div className="brand"><span className="lane">Lane</span>Twin</div>
      <span className="site-lbl">Site A · Drive-through</span>
      <select className="lt-select" value={sourceId} onChange={(e) => { getVideo()?.pause(); setSource(e.target.value as SourceId); }} title="Recording">
        {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <span className={"pill " + status.cls}>{status.label}</span>
      <div className="topbar-right">
        <button className="btn" onClick={toggle} title={playing ? "Pause" : "Play"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <select className="lt-select" value={rate} onChange={(e) => changeRate(Number(e.target.value))} title="Playback speed">
          {[0.5, 1, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        <span className="clock-lt num" title="Source video timestamp">{fmtClock(t)}<span className="muted" style={{ fontSize: 12 }}> / {fmtClock(src?.durationS)}</span></span>
      </div>
    </header>
  );
}
