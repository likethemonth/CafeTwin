import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SOURCES, useStore } from "../../store";
import { useDerived } from "../../logic/derive";
import type { TrackState } from "../../logic/contract";
import { registerVideo } from "./videoRegistry";
import { useZoneDraft } from "./ZoneEditor";
import "./video.css";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  cw: number;
  ch: number;
}

const COLORS = {
  normal: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  uncertain: "#64748b",
  selected: "#3b82f6",
};

function boxColor(ts: TrackState, selected: boolean): string {
  if (selected) return COLORS.selected;
  if (ts.stale) return COLORS.uncertain;
  return COLORS[ts.status] ?? COLORS.uncertain;
}

export function VideoPanel() {
  const sourceId = useStore((s) => s.sourceId);
  const source = SOURCES.find((s) => s.id === sourceId) ?? SOURCES[0];
  return <VideoStage key={source.id} />;
}

function VideoStage() {
  const sourceId = useStore((s) => s.sourceId);
  const source = SOURCES.find((s) => s.id === sourceId) ?? SOURCES[0];
  const playing = useStore((s) => s.playing);
  const rate = useStore((s) => s.rate);
  const seekRequest = useStore((s) => s.seekRequest);
  const setTime = useStore((s) => s.setTime);
  const setPlaying = useStore((s) => s.setPlaying);
  const select = useStore((s) => s.select);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const zones = useStore((s) => s.zones);
  const showZoneLabels = useStore((s) => s.settings.showZoneLabels);
  const derived = useDerived();
  const draft = useZoneDraft();

  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isFs, setIsFs] = useState(false);

  // Register element for other panels.
  useEffect(() => {
    registerVideo(videoRef.current);
    return () => registerVideo(null);
  }, []);

  // Restore per-source time on mount.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const t0 = useStore.getState().times[source.id] ?? 0;
    const apply = () => {
      try {
        v.currentTime = t0;
      } catch {
        /* ignore */
      }
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener("loadedmetadata", apply, { once: true });
    return () => v.removeEventListener("loadedmetadata", apply);
  }, [source.id]);

  // Letterboxed content rect (object-fit: contain).
  const measure = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const cw = v.clientWidth;
    const ch = v.clientHeight;
    const vw = v.videoWidth || source.width;
    const vh = v.videoHeight || source.height;
    if (!cw || !ch || !vw || !vh) return;
    const scale = Math.min(cw / vw, ch / vh);
    const w = vw * scale;
    const h = vh * scale;
    setRect({ x: (cw - w) / 2, y: (ch - h) / 2, w, h, cw, ch });
  }, [source.width, source.height]);

  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    v.addEventListener("loadedmetadata", measure);
    return () => {
      ro.disconnect();
      v.removeEventListener("loadedmetadata", measure);
    };
  }, [measure]);

  // Fullscreen tracking.
  useEffect(() => {
    const onFs = () => {
      setIsFs(document.fullscreenElement === wrapRef.current);
      requestAnimationFrame(measure);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [measure]);

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  // Shared clock: timeupdate + rAF while playing.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    const onEnded = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("ended", onEnded);
    };
  }, [setTime, setPlaying]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      const p = v.play();
      if (p) p.catch(() => setPlaying(false));
      let raf = 0;
      const loop = () => {
        setTime(v.currentTime);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    } else {
      v.pause();
    }
  }, [playing, setTime, setPlaying]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate]);

  // Seek requests (nonce change).
  const lastNonce = useRef<number | null>(seekRequest?.nonce ?? null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !seekRequest) return;
    if (seekRequest.nonce === lastNonce.current) return;
    lastNonce.current = seekRequest.nonce;
    const dur = Number.isFinite(v.duration) ? v.duration : source.durationS;
    v.currentTime = Math.max(0, Math.min(seekRequest.t, dur));
  }, [seekRequest, source.durationS]);

  const editing = draft.active && !playing;

  const onOverlayClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!rect) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - bounds.left - rect.x;
    const py = e.clientY - bounds.top - rect.y;
    const nx = px / rect.w;
    const ny = py / rect.h;
    if (editing) {
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      draft.addPoint([+nx.toFixed(4), +ny.toFixed(4)]);
      return;
    }
    select(null);
  };

  const toPx = (nx: number, ny: number) => [rect!.x + nx * rect!.w, rect!.y + ny * rect!.h] as const;
  const sourceZones = zones.filter((z) => z.sourceId === source.id);
  const boxes = derived.now.filter((ts: TrackState) => ts.bbox != null && ts.track.sourceId === source.id);

  return (
    <div ref={wrapRef} className={`vp-stage ${isFs ? "vp-fs" : ""}`}>
      <video
        ref={videoRef}
        className="vp-video"
        src={source.url}
        muted
        playsInline
        preload="auto"
        controls={false}
      />
      {rect && (
        <svg
          className={`vp-overlay ${editing ? "vp-editing" : ""}`}
          width={rect.cw}
          height={rect.ch}
          viewBox={`0 0 ${rect.cw} ${rect.ch}`}
          onClick={onOverlayClick}
        >
          {sourceZones.map((z) => {
            const pts = z.points.map(([x, y]) => toPx(x, y).join(",")).join(" ");
            const [lx, ly] = toPx(Math.min(...z.points.map((p) => p[0])), Math.min(...z.points.map((p) => p[1])));
            return (
              <g key={z.id} className="vp-zone">
                <polygon points={pts} fill={z.color} fillOpacity={0.14} stroke={z.color} strokeOpacity={0.7} strokeWidth={1.5} />
                {showZoneLabels && (
                  <text x={lx + 4} y={ly + 12} className="vp-zone-label" fill={z.color}>
                    {z.name}
                  </text>
                )}
              </g>
            );
          })}

          {boxes.map((ts: TrackState) => {
            const b = ts.bbox!;
            const [x1, y1] = toPx(b[0], b[1]);
            const [x2, y2] = toPx(b[2], b[3]);
            const sel = ts.track.id === selectedTrackId;
            const color = boxColor(ts, sel);
            const label = `${ts.track.id} · ${ts.track.cls}${ts.dwellS != null ? ` · ${ts.dwellS.toFixed(1)}s` : ""}`;
            return (
              <g
                key={ts.track.id}
                className="vp-box"
                opacity={ts.stale ? 0.45 : 1}
                onClick={(e) => {
                  if (editing) return;
                  e.stopPropagation();
                  select(ts.track.id);
                }}
              >
                <rect
                  x={x1}
                  y={y1}
                  width={Math.max(1, x2 - x1)}
                  height={Math.max(1, y2 - y1)}
                  fill={color}
                  fillOpacity={0.08}
                  stroke={color}
                  strokeWidth={sel ? 3 : 2}
                  strokeDasharray={ts.estimated ? "6 4" : undefined}
                />
                <rect x={x1} y={Math.max(0, y1 - 16)} width={label.length * 6.6 + 8} height={16} fill={color} rx={2} />
                <text x={x1 + 4} y={Math.max(0, y1 - 16) + 12} className="vp-box-label">
                  {label}
                </text>
              </g>
            );
          })}

          {draft.active && draft.points.length > 0 && (
            <g className="vp-draft" pointerEvents="none">
              {draft.closed ? (
                <polygon
                  points={draft.points.map(([x, y]) => toPx(x, y).join(",")).join(" ")}
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  stroke="#93c5fd"
                  strokeWidth={2}
                />
              ) : (
                <polyline
                  points={draft.points.map(([x, y]) => toPx(x, y).join(",")).join(" ")}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              {draft.points.map(([x, y], i) => {
                const [px, py] = toPx(x, y);
                return <circle key={i} cx={px} cy={py} r={4} fill="#93c5fd" />;
              })}
            </g>
          )}
        </svg>
      )}
      <button className="vp-fs-btn" onClick={toggleFullscreen} title="Toggle fullscreen">
        {isFs ? "Exit fullscreen" : "Fullscreen"}
      </button>
      {draft.active && <div className="vp-edit-badge">{playing ? "Pause to edit zones" : "Zone edit mode"}</div>}
    </div>
  );
}

export default VideoPanel;
