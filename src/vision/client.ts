// Browser-side frame capture + analysis requests. Results are cached under the ORIGINAL timestamp.
import { useStore } from "../store";
import { FrameObservationSchema, type FrameObservation, type SourceId } from "../types";

const MAX_REQUESTS = 12;
const epochs: Record<SourceId, number> = { drivethrough: 0, aerial: 0, staff: 0 };

function newSession(sourceId: SourceId): string {
  epochs[sourceId] += 1;
  return `${sourceId}:${epochs[sourceId]}`;
}
function isCurrent(sourceId: SourceId, sessionId: string): boolean {
  return sessionId === `${sourceId}:${epochs[sourceId]}`;
}
/** Invalidate any in-flight requests for this source (late responses are ignored). */
export function cancelSessions(sourceId: SourceId): void {
  epochs[sourceId] += 1;
}

const key = (t: number) => t.toFixed(2);

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 0.01 && video.readyState >= 2) return resolve();
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("video seek failed"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("video seek timed out"));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}

function waitLoaded(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("video failed to load")), { once: true });
  });
}

const clones = new WeakMap<HTMLVideoElement, HTMLVideoElement>();
function hiddenClone(video: HTMLVideoElement): HTMLVideoElement {
  let c = clones.get(video);
  if (!c || c.src !== video.currentSrc) {
    c = document.createElement("video");
    c.muted = true;
    c.preload = "auto";
    c.crossOrigin = "anonymous";
    c.playsInline = true;
    c.src = video.currentSrc || video.src;
    clones.set(video, c);
  }
  return c;
}

/** Seek a hidden clone of the video to t, draw it to a canvas, return a JPEG data URL. */
export async function captureFrame(video: HTMLVideoElement, t: number): Promise<string> {
  const v = hiddenClone(video);
  await waitLoaded(v);
  const dur = isFinite(v.duration) ? v.duration : t;
  await seekTo(v, Math.min(Math.max(0, t), Math.max(0, dur - 0.05)));
  const w = v.videoWidth || 768;
  const h = v.videoHeight || 432;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(v, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function requestObservation(
  sessionId: string,
  t: number,
  imageDataUrl: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<FrameObservation> {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, t, imageDataUrl, width, height }),
    signal,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* ignore */
  }
  if (!resp.ok) {
    const code = json?.error ?? `http_${resp.status}`;
    const msg =
      code === "not_configured"
        ? "Vision not configured (no OPENAI_API_KEY). Use synthetic demo."
        : resp.status === 429
          ? "Vision provider rate-limited; try again shortly."
          : resp.status === 504
            ? "Vision request timed out."
            : json?.message ?? `Vision request failed (${code}).`;
    throw new Error(msg);
  }
  const parsed = FrameObservationSchema.safeParse(json);
  if (!parsed.success) throw new Error("Vision response failed validation.");
  // always store under the original requested timestamp + session
  return { ...parsed.data, t, sessionId };
}

/** Analyse the frame at the video's current time. */
export async function analyseCurrentFrame(sourceId: SourceId, video: HTMLVideoElement): Promise<FrameObservation | null> {
  return analyseSegment(sourceId, video, { from: video.currentTime, len: 0, every: 1 }).then((r) => r[0] ?? null);
}

export interface SegmentOptions {
  from: number;
  len: number;
  every: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** Analyse a bounded set of sampled timestamps (max 12). Cancellable; skips cached timestamps. */
export async function analyseSegment(
  sourceId: SourceId,
  video: HTMLVideoElement,
  opts: SegmentOptions,
): Promise<FrameObservation[]> {
  const { from, len, every, signal, onProgress } = opts;
  const store = useStore.getState();
  const sessionId = newSession(sourceId);
  const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
  const step = Math.max(1, every || 1);
  const times: number[] = [];
  for (let t = Math.max(0, from); t <= from + Math.max(0, len) + 1e-6 && t < dur && times.length < MAX_REQUESTS; t += step) {
    times.push(Math.round(t * 100) / 100);
  }
  if (times.length === 0) times.push(Math.round(Math.max(0, Math.min(from, dur)) * 100) / 100);
  const cached = store.observations[sourceId] ?? {};
  const todo = times.filter((t) => cached[key(t)]?.provenance !== "model");
  const total = todo.length;
  const results: FrameObservation[] = [];
  if (total === 0) {
    store.setAnalysis(sourceId, { kind: "done", frames: Object.keys(cached).length });
    return results;
  }
  store.setAnalysis(sourceId, { kind: "running", done: 0, total });
  onProgress?.(0, total);
  let done = 0;
  try {
    for (const t of todo) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (!isCurrent(sourceId, sessionId)) return results;
      const img = await captureFrame(video, t);
      const w = video.videoWidth || 768;
      const h = video.videoHeight || 432;
      const obs = await requestObservation(sessionId, t, img, w, h, signal);
      if (!isCurrent(sourceId, sessionId)) return results; // stale session: drop late result
      useStore.getState().addObservation(obs);
      results.push(obs);
      done += 1;
      useStore.getState().setAnalysis(sourceId, { kind: "running", done, total });
      onProgress?.(done, total);
    }
    if (isCurrent(sourceId, sessionId)) {
      useStore.getState().setAnalysis(sourceId, {
        kind: "done",
        frames: Object.keys(useStore.getState().observations[sourceId] ?? {}).length,
      });
    }
  } catch (e: any) {
    if (!isCurrent(sourceId, sessionId)) return results;
    const aborted = e?.name === "AbortError" || signal?.aborted;
    useStore.getState().setAnalysis(
      sourceId,
      aborted
        ? { kind: "error", message: `Analysis cancelled after ${done}/${total} frames; earlier results kept.` }
        : { kind: "error", message: `${e?.message ?? String(e)} (${done}/${total} frames analysed; earlier results kept)` },
    );
  }
  return results;
}
