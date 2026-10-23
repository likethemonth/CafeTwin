// Interface contract between logic (derive.ts) and UI. Implemented in derive.ts.
import type { Alert, BBox, OperationalEvent, Track } from "../types";

export type BoxStatus = "normal" | "amber" | "red" | "uncertain";

export interface TrackState {
  track: Track;
  bbox: BBox | null;        // box at current time (observed or interpolated); null if not visible
  estimated: boolean;       // interpolated between close observations
  stale: boolean;           // last observation older than staleness gap -> fade/hide
  zoneId: string | null;    // confirmed zone (hysteresis applied)
  dwellS: number | null;    // observed time in current zone; null if no zone
  status: BoxStatus;
  laneProgress: number | null; // 0..1 schematic lane position; null = unmapped
}

export interface Metrics {
  queueCount: number | null;        // null if no analysed frame near now
  longestDwellS: number | null;
  longestTrackId: string | null;
  completedExits: number | null;
  firstContactTimes: { trackId: string; t: number }[]; // confirmed contacts only
  queueSeries: { t: number; count: number }[];
  analysedFrom: number | null;
  analysedTo: number | null;
  sampleCount: number;
}

export interface Derived {
  tracks: Track[];
  events: OperationalEvent[]; // only events with t <= current time
  alerts: Alert[];            // unacked + acked, t <= current time
  now: TrackState[];
  metrics: Metrics;
}
