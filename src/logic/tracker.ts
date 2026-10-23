// Deterministic greedy one-to-one tracker over sorted frame observations.
import type { BBox, FrameObservation, ObjClass, Provenance, SourceId, Track } from "../types";

export const MAX_GAP_S = 4;
const MIN_SCORE = 0.15;
const AMBIGUITY_MARGIN = 0.08;

export function iou(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

const centre = (b: BBox): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/** Match score in [0,1]; 0 = not matchable. Tolerates more motion for larger gaps. */
function matchScore(prev: BBox, next: BBox, gapS: number): number {
  const [ax, ay] = centre(prev);
  const [bx, by] = centre(next);
  const d = Math.hypot(ax - bx, ay - by);
  const size = Math.max(prev[2] - prev[0], prev[3] - prev[1], 0.05);
  const allowed = size * (0.6 + 0.4 * gapS) + 0.05;
  if (d > allowed) return 0;
  return 0.6 * iou(prev, next) + 0.4 * (1 - d / allowed);
}

export function buildTracks(observations: FrameObservation[], sourceId: SourceId): Track[] {
  const obs = [...observations].sort((a, b) => a.t - b.t);
  const tracks: Track[] = [];
  let active: Track[] = [];
  const counters: Record<ObjClass, number> = { vehicle: 0, person: 0 };
  const firstT = obs.length ? obs[0].t : 0;
  let prevCount = -1;

  const newTrack = (cls: ObjClass, t: number, bbox: BBox, provenance: Provenance, uncertain: boolean): Track => {
    counters[cls] += 1;
    const tr: Track = {
      id: `${cls === "vehicle" ? "V" : "P"}${String(counters[cls]).padStart(3, "0")}`,
      sourceId,
      cls,
      firstT: t,
      lastT: t,
      samples: [{ t, bbox, estimated: false }],
      zoneHistory: [],
      uncertain,
      presentAtStart: t === firstT && t < 1,
      exited: false,
      provenance,
    };
    tracks.push(tr);
    return tr;
  };

  for (const o of obs) {
    const prov: Provenance = o.provenance;
    active = sourceId === "aerial" ? [] : active.filter((tr) => o.t - tr.lastT <= MAX_GAP_S && tr.provenance === prov);
    const pairs: { ti: number; di: number; s: number }[] = [];
    o.detections.forEach((d, di) => {
      active.forEach((tr, ti) => {
        if (tr.cls !== d.cls || tr.lastT >= o.t) return;
        const s = matchScore(tr.samples[tr.samples.length - 1].bbox, d.bbox as BBox, o.t - tr.lastT);
        if (s >= MIN_SCORE) pairs.push({ ti, di, s });
      });
    });
    // deterministic order: score desc, then indices
    pairs.sort((a, b) => b.s - a.s || a.ti - b.ti || a.di - b.di);

    // scene cut heuristic: nothing matched and the count changed drastically
    if (active.length > 0 && o.detections.length > 0 && pairs.length === 0 && prevCount >= 0 && Math.abs(o.detections.length - prevCount) >= 2) {
      active = [];
    }

    const usedT = new Set<number>();
    const usedD = new Set<number>();
    const assigned = new Map<number, { tr: Track; ambiguous: boolean }>();
    for (const p of pairs) {
      if (usedT.has(p.ti) || usedD.has(p.di)) continue;
      // ambiguity: another unused candidate for this detection (or track) within margin
      const rival = pairs.some(
        (q) => q !== p && !usedT.has(q.ti) && !usedD.has(q.di) && (q.di === p.di || q.ti === p.ti) && p.s - q.s < AMBIGUITY_MARGIN,
      );
      usedT.add(p.ti);
      usedD.add(p.di);
      assigned.set(p.di, { tr: active[p.ti], ambiguous: rival });
    }

    const nextActive: Track[] = [];
    o.detections.forEach((d, di) => {
      const bbox = d.bbox as BBox;
      const a = assigned.get(di);
      if (a && !a.ambiguous) {
        a.tr.samples.push({ t: o.t, bbox, estimated: false });
        a.tr.lastT = o.t;
        nextActive.push(a.tr);
      } else if (a && a.ambiguous) {
        // do not guess identity: close old track as uncertain, start a new uncertain track
        a.tr.uncertain = true;
        nextActive.push(newTrack(d.cls, o.t, bbox, prov, true));
      } else {
        nextActive.push(newTrack(d.cls, o.t, bbox, prov, false));
      }
    });
    // unmatched active tracks remain eligible until MAX_GAP_S
    active.forEach((tr, ti) => {
      if (!usedT.has(ti) && !nextActive.includes(tr)) nextActive.push(tr);
    });
    active = nextActive.filter((tr) => !(tr.uncertain && assigned.size > 0 && [...assigned.values()].some((a) => a.ambiguous && a.tr === tr)));
    prevCount = o.detections.length;
  }
  return tracks;
}
