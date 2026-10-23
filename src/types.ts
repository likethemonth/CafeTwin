// Shared domain records for LaneTwin. All times are SOURCE-VIDEO seconds.
import { z } from "zod";

export type Provenance = "model" | "rule" | "manual" | "synthetic";
export type ObjClass = "vehicle" | "person";
export type SourceId = "drivethrough" | "aerial" | "staff";

/** [xMin, yMin, xMax, yMax], normalised 0–1 from image top-left. */
export type BBox = [number, number, number, number];

export const BBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine((b) => b.every((v) => v >= 0 && v <= 1), "bbox out of 0–1 bounds")
  .refine((b) => b[0] < b[2] && b[1] < b[3], "bbox coordinates misordered");

export const DetectionSchema = z.object({
  id: z.string(),
  cls: z.enum(["vehicle", "person"]),
  bbox: BBoxSchema,
  colour: z.string().optional(),
  note: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(), // only if provider returns it; uncalibrated
});
export type Detection = z.infer<typeof DetectionSchema>;

export const FrameObservationSchema = z.object({
  sessionId: z.string(),
  t: z.number().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  detections: z.array(DetectionSchema),
  provenance: z.enum(["model", "synthetic"]),
  model: z.string().optional(),
});
export type FrameObservation = z.infer<typeof FrameObservationSchema>;

export interface VideoSource {
  id: SourceId;
  label: string;
  url: string;
  durationS: number;
  width: number;
  height: number;
  fixedCamera: boolean;
  /** what inspection established about this clip */
  notes: string;
}

export type ZoneRole = "queue" | "order" | "pickup" | "exit" | "staff";
export interface Zone {
  id: string;
  sourceId: SourceId;
  name: string;
  role: ZoneRole;
  /** polygon in normalised image coords */
  points: [number, number][];
  /** Visible service opening; membership still uses the ground-area polygon above. */
  displayPoints?: [number, number][];
  color: string;
}

export interface TrackSample {
  t: number;
  bbox: BBox;
  estimated: boolean; // true = interpolated
}

export interface ZoneVisit {
  zoneId: string;
  enterT: number;
  exitT: number | null;
}

export interface Track {
  id: string; // V001 / P001
  sourceId: SourceId;
  cls: ObjClass;
  firstT: number;
  lastT: number;
  samples: TrackSample[]; // observed only
  zoneHistory: ZoneVisit[];
  uncertain: boolean;
  presentAtStart: boolean; // arrival unknown
  exited: boolean; // only via exit-zone observation
  provenance: Provenance;
}

export type EventKind =
  | "first_observed"
  | "zone_entered"
  | "zone_exited"
  | "exit_crossed"
  | "track_lost"
  | "wait_exceeded"
  | "candidate_contact"
  | "confirmed_contact";

export interface OperationalEvent {
  id: string; // deterministic: `${kind}:${trackId}:${zoneId}:${t}`
  sourceId: SourceId;
  t: number;
  kind: EventKind;
  trackId?: string;
  zoneId?: string;
  message: string;
  provenance: Provenance;
}

export interface Alert {
  id: string; // = event id of wait_exceeded
  sourceId: SourceId;
  trackId: string;
  t: number;
  message: string;
}

export interface Scenario {
  orderTakers: 1 | 2;
  arrivalsPerMin: number;
  orderServiceS: number;
  pickupServiceS: number;
}

export type AnalysisStatus =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "error"; message: string }
  | { kind: "done"; frames: number };
