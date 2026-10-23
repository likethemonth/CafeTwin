// Pure derivation: observations + zones + time -> tracks, events, alerts, current state, metrics.
import { useMemo } from "react";
import { SOURCES, activeObservations, useStore, type Settings } from "../store";
import type { Alert, BBox, FrameObservation, OperationalEvent, SourceId, Track, TrackSample, Zone, ZoneVisit } from "../types";
import type { BoxStatus, Derived, Metrics, TrackState } from "./contract";
import { buildTracks } from "./tracker";
import { LANE_ZONES } from "../components/twin/lane";

const INTERP_MAX_GAP_S = 6;
const STALE_S = 4;
const HIDE_S = 6;
const NEAR_NOW_S = 4;
const WAIT_ROLES = new Set(["queue", "order", "pickup"]);
const EPS = 1e-6;

const r2 = (t: number) => Math.round(t * 100) / 100;
const fmt = (t: number) => r2(t).toFixed(2);
const bottomCentre = (b: BBox): [number, number] => [(b[0] + b[2]) / 2, b[3]];

export function pointInPolygon([x, y]: [number, number], pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Raw zone for a bbox. Exit zone wins over others so a car crossing is counted. */
function rawZone(b: BBox, zones: Zone[]): Zone | null {
  const p = bottomCentre(b);
  const hits = zones.filter((z) => z.points.length >= 3 && pointInPolygon(p, z.points));
  return hits.find((z) => z.role === "exit") ?? hits[0] ?? null;
}

/** Zone visits with hysteresis: need 2 consecutive samples to confirm (1 if only one sample / exit zone). */
function zoneVisits(samples: TrackSample[], zones: Zone[]): ZoneVisit[] {
  const visits: ZoneVisit[] = [];
  const byId = new Map(zones.map((z) => [z.id, z]));
  let confirmed: string | null = null;
  const raw = samples.map((s) => rawZone(s.bbox, zones)?.id ?? null);
  for (let i = 0; i < samples.length; i++) {
    const r = raw[i];
    if (r === confirmed) continue;
    const isExit = r !== null && byId.get(r)?.role === "exit";
    const agreed = samples.length === 1 || isExit || (i + 1 < samples.length && raw[i + 1] === r);
    if (!agreed) continue;
    const t = samples[i].t;
    if (confirmed !== null) {
      const open = visits[visits.length - 1];
      if (open && open.exitT === null) open.exitT = t;
    }
    if (r !== null) visits.push({ zoneId: r, enterT: t, exitT: null });
    confirmed = r;
  }
  return visits;
}

function interpolate(a: BBox, b: BBox, k: number): BBox {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

function near(person: BBox, vehicle: BBox): boolean {
  const pad = 0.03;
  return !(person[2] < vehicle[0] - pad || person[0] > vehicle[2] + pad || person[3] < vehicle[1] - pad || person[1] > vehicle[3] + pad);
}

export function derive(
  observations: FrameObservation[],
  zonesAll: Zone[],
  settings: Settings,
  t: number,
  ackedAlerts: string[],
  contactReviews: Record<string, "confirmed" | "rejected">,
  sourceId: SourceId,
): Derived {
  void ackedAlerts; // alerts include acked + unacked; UI decides display
  const obs = [...observations].sort((a, b) => a.t - b.t);
  const zones = zonesAll.filter((z) => z.sourceId === sourceId);
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const target = settings.waitTargetS;
  const src = SOURCES.find((s) => s.id === sourceId);
  const mapped = sourceId === "drivethrough" && !!src?.fixedCamera;
  const fullTracks = buildTracks(obs, sourceId);
  const now = t + EPS;

  const events: OperationalEvent[] = [];
  const push = (e: Omit<OperationalEvent, "id" | "sourceId">) => {
    if (e.t > now) return;
    const id = `${sourceId}:${obs[0]?.provenance ?? "model"}:${e.kind}:${e.trackId ?? "-"}:${e.zoneId ?? "-"}:${fmt(e.t)}`;
    events.push({ ...e, t: r2(e.t), id, sourceId });
  };

  const tracks: Track[] = [];
  const states: TrackState[] = [];

  for (const full of fullTracks) {
    if (full.firstT > now) continue;
    const seen = full.samples.filter((s) => s.t <= now);
    const visits = zoneVisits(seen, zones);
    const exitVisit = visits.find((v) => zoneById.get(v.zoneId)?.role === "exit");
    const track: Track = {
      ...full,
      lastT: seen[seen.length - 1].t,
      samples: seen,
      zoneHistory: visits,
      exited: !!exitVisit,
    };
    tracks.push(track);
    const prov = track.provenance;
    const label = track.cls === "vehicle" ? "Vehicle" : "Person";

    push({
      kind: "first_observed",
      t: track.firstT,
      trackId: track.id,
      message: track.presentAtStart ? `${label} ${track.id} present at start (arrival unknown)` : `${label} ${track.id} first observed`,
      provenance: prov,
    });
    for (const v of visits) {
      const z = zoneById.get(v.zoneId);
      const zn = z?.name ?? v.zoneId;
      if (z?.role === "exit") {
        push({ kind: "exit_crossed", t: v.enterT, trackId: track.id, zoneId: v.zoneId, message: `${track.id} reached ${zn}`, provenance: "rule" });
        continue;
      }
      push({ kind: "zone_entered", t: v.enterT, trackId: track.id, zoneId: v.zoneId, message: `${track.id} entered ${zn}`, provenance: "rule" });
      if (v.exitT !== null)
        push({ kind: "zone_exited", t: v.exitT, trackId: track.id, zoneId: v.zoneId, message: `${track.id} left ${zn}`, provenance: "rule" });
      if (z && WAIT_ROLES.has(z.role)) {
        const end = v.exitT ?? track.lastT;
        if (end - v.enterT > target) {
          push({
            kind: "wait_exceeded",
            // Jump to the actual sample supporting the alert, not an earlier threshold instant.
            t: seen.find((s) => s.t - v.enterT > target && s.t <= end)!.t,
            trackId: track.id,
            zoneId: v.zoneId,
            message: `${track.id} observed in ${zn} longer than ${target}s target`,
            provenance: "rule",
          });
        }
      }
    }
    // disappearance without exit -> track_lost at first later observation where it is absent
    if (!exitVisit) {
      const fullLast = full.lastT;
      const later = obs.find((o) => o.t > fullLast + EPS);
      if (later && later.t <= now) {
        push({ kind: "track_lost", t: later.t, trackId: track.id, message: `${track.id} no longer observed (not counted as exit)`, provenance: "rule" });
      }
    }

    // ----- current state -----
    if (exitVisit && now > exitVisit.enterT + STALE_S) continue;
    const prev = seen[seen.length - 1];
    const next = full.samples.find((s) => s.t > now);
    // A later analysed frame with no matching detection is evidence of absence.
    const latestFrame = [...obs].reverse().find((o) => o.t <= now);
    if (latestFrame && prev.t < latestFrame.t - EPS) continue;
    let bbox: BBox | null = null;
    let estimated = false;
    if (Math.abs(prev.t - t) < 0.01) {
      bbox = prev.bbox;
    } else if (next && next.t - prev.t <= INTERP_MAX_GAP_S) {
      bbox = interpolate(prev.bbox, next.bbox, (t - prev.t) / (next.t - prev.t));
      estimated = true;
    } else if (t - prev.t <= HIDE_S) {
      bbox = prev.bbox;
    }
    if (!bbox) continue;
    const stale = !estimated && t - prev.t > STALE_S;
    const open = visits.length && visits[visits.length - 1].exitT === null ? visits[visits.length - 1] : null;
    const zoneId = open?.zoneId ?? null;
    const dwellS = open ? Math.max(0, Math.min(t, track.lastT) - open.enterT) : null;
    const zrole = zoneId ? zoneById.get(zoneId)?.role : undefined;
    let status: BoxStatus = "normal";
    if (track.uncertain || stale) status = "uncertain";
    else if (dwellS !== null && zrole && WAIT_ROLES.has(zrole)) {
      if (dwellS > target) status = "red";
      else if (dwellS > 0.75 * target) status = "amber";
    }
    const mappingZone = mapped ? rawZone(bbox, zones) : null;
    const laneZone = LANE_ZONES.find((z) => z.role === mappingZone?.role);
    const xs = mappingZone?.points.map((p) => p[0]) ?? [];
    const fraction = xs.length ? Math.min(1, Math.max(0, (bottomCentre(bbox)[0] - Math.min(...xs)) / Math.max(0.001, Math.max(...xs) - Math.min(...xs)))) : 0;
    let laneProgress = laneZone ? laneZone.from + fraction * (laneZone.to - laneZone.from) : null;
    if (mapped && laneProgress === null && track.cls === "vehicle") {
      const [x, y] = bottomCentre(bbox);
      const spans = zones.flatMap(z => {
        const lane = LANE_ZONES.find(l => l.role === z.role);
        if (!lane || z.points.length < 3) return [];
        return [{min: Math.min(...z.points.map(p=>p[0])), max: Math.max(...z.points.map(p=>p[0])),
          low: Math.min(...z.points.map(p=>p[1])), high: Math.max(...z.points.map(p=>p[1])), lane}];
      }).sort((a,b)=>a.min-b.min);
      for (let i=1;i<spans.length;i++) {
        const a=spans[i-1], b=spans[i];
        if (x>a.max && x<b.min && y>=Math.max(a.low,b.low) && y<=Math.min(a.high,b.high)) {
          laneProgress=a.lane.to+(x-a.max)/(b.min-a.max)*(b.lane.from-a.lane.to);
        }
      }
    }
    states.push({ track, bbox, estimated, stale, zoneId, dwellS, status, laneProgress });
  }

  // ----- contacts (generic: person bbox near vehicle bbox in the same frame) -----
  const firstContactTimes: { trackId: string; t: number }[] = [];
  const contactSeen = new Set<string>();
  const persons = tracks.filter((tr) => tr.cls === "person");
  const vehicles = tracks.filter((tr) => tr.cls === "vehicle");
  if (persons.length && vehicles.length) {
    for (const o of obs) {
      if (o.t > now) break;
      for (const p of persons) {
        const ps = p.samples.find((s) => s.t === o.t);
        if (!ps) continue;
        for (const v of vehicles) {
          const pair = `${p.id}>${v.id}`;
          if (contactSeen.has(pair)) continue;
          const vs = v.samples.find((s) => s.t === o.t);
          if (!vs || !near(ps.bbox, vs.bbox)) continue;
          contactSeen.add(pair);
          const id = `${sourceId}:${v.provenance}:candidate_contact:${v.id}:${p.id}:${fmt(o.t)}`;
          const review = contactReviews[id];
          if (review === "rejected") continue;
          events.push({ id, sourceId, t: r2(o.t), kind: "candidate_contact", trackId: v.id, zoneId: undefined,
            message: `Possible contact: ${p.id} near ${v.id} (needs review)`, provenance: "rule" });
          if (review === "confirmed") {
            events.push({ id: `${sourceId}:${v.provenance}:confirmed_contact:${v.id}:${p.id}:${fmt(o.t)}`, sourceId, t: r2(o.t), kind: "confirmed_contact",
              trackId: v.id, message: `Contact confirmed: ${p.id} with ${v.id}`, provenance: "manual" });
            if (!firstContactTimes.some((c) => c.trackId === v.id)) firstContactTimes.push({ trackId: v.id, t: r2(o.t) });
          }
        }
      }
    }
  }

  events.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const alerts: Alert[] = events
    .filter((e) => e.kind === "wait_exceeded" && e.trackId)
    .map((e) => ({ id: e.id, sourceId, trackId: e.trackId!, t: e.t, message: e.message }));

  // ----- metrics -----
  const queueZones = zones.filter((z) => z.role === "queue" || z.role === "order");
  const hasNear = obs.some((o) => o.t <= now && t - o.t <= NEAR_NOW_S);
  const visible = states.filter((s) => s.bbox && !s.stale);
  const queueCount = hasNear
    ? visible.filter((s) => s.track.cls === "vehicle" && queueZones.some((z) => z.id === s.zoneId)).length
    : null;
  let longestDwellS: number | null = null;
  let longestTrackId: string | null = null;
  for (const s of states) {
    if (s.dwellS !== null && (longestDwellS === null || s.dwellS > longestDwellS)) {
      longestDwellS = r2(s.dwellS);
      longestTrackId = s.track.id;
    }
  }
  const anyPast = obs.some((o) => o.t <= now);
  const metrics: Metrics = {
    queueCount,
    longestDwellS,
    longestTrackId,
    completedExits: anyPast ? tracks.filter((tr) => tr.exited).length : null,
    firstContactTimes,
    queueSeries: obs.map((o) => ({
      t: o.t,
      count: o.detections.filter((d) => {
        const p = bottomCentre(d.bbox as BBox);
        return d.cls === "vehicle" && queueZones.some((z) => z.points.length >= 3 && pointInPolygon(p, z.points));
      }).length,
    })),
    analysedFrom: obs.length ? obs[0].t : null,
    analysedTo: obs.length ? obs[obs.length - 1].t : null,
    sampleCount: obs.length,
  };

  return { tracks, events, alerts, now: states, metrics };
}

export function useDerived(): Derived {
  const sourceId = useStore((s) => s.sourceId);
  const obsMap = useStore(activeObservations);
  const zones = useStore((s) => s.zones);
  const settings = useStore((s) => s.settings);
  const t = useStore((s) => s.times[s.sourceId]);
  const ackedAlerts = useStore((s) => s.ackedAlerts);
  const contactReviews = useStore((s) => s.contactReviews);
  const observations = useMemo(() => Object.values(obsMap ?? {}), [obsMap]);
  return useMemo(
    () => derive(observations, zones, settings, t ?? 0, ackedAlerts, contactReviews, sourceId),
    [observations, zones, settings, t, ackedAlerts, contactReviews, sourceId],
  );
}
