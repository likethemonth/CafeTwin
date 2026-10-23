import { useEffect, useRef, useState } from "react";
import { SOURCES, useStore } from "../../store";
import { analyseCurrentFrame, analyseSegment, cancelSessions } from "../../vision/client";
import { loadSyntheticSession } from "../../demo/synthetic";
import { getVideo } from "./videoRegistry";
import "./video.css";

const NOT_CONFIGURED_MSG =
  "Hosted vision not configured — configure Azure OpenAI or OPENAI_API_KEY server-side; use synthetic demo to explore.";

function isNotConfigured(msg: string | null | undefined): boolean {
  return !!msg && /not[_ ]configured/i.test(msg);
}

type LastAction = "frame" | "segment" | null;

export function AnalysePanel() {
  const sourceId = useStore((s) => s.sourceId);
  const source = SOURCES.find((s) => s.id === sourceId) ?? SOURCES[0];
  const t = useStore((s) => s.times[s.sourceId] ?? 0);
  const playing = useStore((s) => s.playing);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const status = useStore((s) => s.analysis[s.sourceId]);
  const observations = useStore((s) => s.observations[s.sourceId]);
  const demoObservations = useStore((s) => s.demoObservations[s.sourceId]);
  const clearObservations = useStore((s) => s.clearObservations);
  const setAnalysis = useStore((s) => s.setAnalysis);

  const abortRef = useRef<AbortController | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const busyRef = useRef(false);

  const obsList = Object.values(observations ?? {});
  const modelCount = obsList.filter((o) => o.provenance === "model").length;
  const synthCount = Object.keys(demoObservations ?? {}).length;

  const remaining = Math.max(0, source.durationS - t);
  const segLen = Math.max(0, Math.min(settings.segmentLenS, remaining));
  const every = Math.max(1, settings.sampleEveryS);
  const plannedCount = segLen > 0 ? Math.min(12, Math.floor(segLen / every) + 1) : 0;

  const running = status?.kind === "running";
  const errorMsg = status?.kind === "error" ? status.message : localError;

  const runFrame = async () => {
    const v = getVideo();
    if (!v) return;
    setLastAction("frame");
    setLocalError(null);
    try {
      await analyseCurrentFrame(sourceId, v);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  };

  const runSegment = async () => {
    const v = getVideo();
    if (!v || segLen <= 0) return;
    setLastAction("segment");
    setLocalError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await analyseSegment(sourceId, v, {
        from: t,
        len: segLen,
        every,
        signal: ac.signal,
      });
    } catch (e) {
      if (!ac.signal.aborted) setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  };

  const cancel = () => {
    cancelSessions(sourceId);
    abortRef.current?.abort();
    abortRef.current = null;
    const st = useStore.getState().analysis[sourceId];
    if (st?.kind === "running") setAnalysis(sourceId, { kind: "idle" });
  };

  const retry = () => {
    if (lastAction === "segment") void runSegment();
    else void runFrame();
  };

  // Abort in-flight work when the source changes / unmount.
  useEffect(() => () => { abortRef.current?.abort(); cancelSessions(sourceId); }, [sourceId]);

  // Auto-sample: analyse current frame every sampleEveryS while playing, uncached timestamps only.
  useEffect(() => {
    if (!settings.autoSample || !playing) return;
    const id = window.setInterval(async () => {
      if (busyRef.current) return;
      const v = getVideo();
      if (!v) return;
      const key = v.currentTime.toFixed(2);
      const cache = useStore.getState().observations[sourceId] ?? {};
      const near = Object.keys(cache).some((k) => Math.abs(Number(k) - v.currentTime) < every / 2);
      if (cache[key] || near) return;
      busyRef.current = true;
      try {
        await analyseCurrentFrame(sourceId, v);
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : String(e));
      } finally {
        busyRef.current = false;
      }
    }, every * 1000);
    return () => window.clearInterval(id);
  }, [settings.autoSample, playing, every, sourceId]);

  const pct = status?.kind === "running" && status.total > 0 ? (status.done / status.total) * 100 : status?.kind === "done" ? 100 : 0;

  return (
    <div className="vp-card vp-analyse">
      <div className="vp-card-head">
        <span className="vp-card-title">Analysis</span>
        <span className="vp-hint">
          t=<span className="vp-num">{t.toFixed(2)}s</span>
        </span>
      </div>

      <div className="vp-row">
        <button className="vp-btn" onClick={runFrame} disabled={running}>
          Analyse current frame
        </button>
        <button className="vp-btn vp-btn-primary" onClick={runSegment} disabled={running || plannedCount === 0}>
          Analyse segment
        </button>
        <button className="vp-btn" onClick={cancel} disabled={!running}>
          Cancel
        </button>
      </div>
      <p className="vp-hint">
        Segment: <span className="vp-num">{t.toFixed(1)}</span>–<span className="vp-num">{(t + segLen).toFixed(1)}s</span>{" "}
        every <span className="vp-num">{every}s</span> → <span className="vp-num">{plannedCount}</span> request
        {plannedCount === 1 ? "" : "s"}
      </p>

      {(running || status?.kind === "done") && (
        <div className="vp-progress">
          <div className="vp-progress-bar" style={{ width: `${pct}%` }} />
          <span className="vp-progress-text vp-num">
            {status?.kind === "running" ? `${status.done}/${status.total}` : status?.kind === "done" ? `${status.frames} frames` : ""}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="vp-error">
          <span>{isNotConfigured(errorMsg) ? NOT_CONFIGURED_MSG : errorMsg}</span>
          <button className="vp-btn vp-btn-small" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <div className="vp-row vp-settings">
        <label className="vp-field">
          <span>Sample every (s)</span>
          <input
            className="vp-input vp-num"
            type="number"
            min={0.25}
            step={0.25}
            value={settings.sampleEveryS}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) updateSettings({ sampleEveryS: n });
            }}
          />
        </label>
        <label className="vp-field">
          <span>Wait target (s)</span>
          <input
            className="vp-input vp-num"
            type="number"
            min={1}
            step={1}
            value={settings.waitTargetS}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) updateSettings({ waitTargetS: n });
            }}
          />
        </label>
        <label className="vp-check">
          <input
            type="checkbox"
            checked={settings.autoSample}
            onChange={(e) => updateSettings({ autoSample: e.target.checked })}
          />
          <span>Auto-sample while playing</span>
        </label>
      </div>

      <div className="vp-row vp-synth">
        <button className="vp-btn vp-btn-synth" onClick={() => loadSyntheticSession(sourceId)}>
          Load synthetic demo <span className="vp-tag vp-tag-synth">SYNTHETIC</span>
        </button>
        <button className="vp-btn" onClick={() => clearObservations(sourceId, "synthetic")} disabled={synthCount === 0}>
          Clear synthetic
        </button>
      </div>

      <p className="vp-hint">
        Cached frames: <span className="vp-num">{obsList.length + synthCount}</span> (model{" "}
        <span className="vp-num">{modelCount}</span>, <span className="vp-tag-synth-text">synthetic</span>{" "}
        <span className="vp-num">{synthCount}</span>)
      </p>
    </div>
  );
}

export default AnalysePanel;
