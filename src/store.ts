// Single shared store. The video element's currentTime (store.t) is the shared clock.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AnalysisStatus, FrameObservation, SourceId, VideoSource, Zone } from "./types";

export const SOURCES: VideoSource[] = [
  {
    id: "drivethrough",
    label: "Drive-through lane (side cam)",
    url: "/footage/Drivethrough.mp4",
    durationS: 15.8,
    width: 768,
    height: 432,
    fixedCamera: true,
    notes: "Fixed side-on camera. Single lane, two service windows (1 = order/pay, 2 = pickup). Stock clip with watermark.",
  },
  {
    id: "aerial",
    label: "Aerial site view",
    url: "/footage/Aerialview.mp4",
    durationS: 15.3,
    width: 768,
    height: 432,
    fixedCamera: false,
    notes: "Top-down drone shot; camera drifts, so image-space zones are frame-local only. Used for schematic layout (lane wraps building).",
  },
  {
    id: "staff",
    label: "Staff working (indoor)",
    url: "/footage/Staffworking.mp4",
    durationS: 10.7,
    width: 768,
    height: 432,
    fixedCamera: true,
    notes: "Indoor staff footage. Person occupancy only; not linked to outdoor twin.",
  },
];

/** Preset zones from inspecting the Drivethrough frame (768x432). */
export const PRESET_ZONES: Zone[] = [
  { id: "z-queue", sourceId: "drivethrough", name: "Approach queue", role: "queue", color: "#38bdf8",
    points: [[0, 0.6], [0.06, 0.6], [0.06, 0.82], [0, 0.82]] },
  { id: "z-order", sourceId: "drivethrough", name: "Window 1 (order/pay)", role: "order", color: "#a78bfa",
    displayPoints: [[80/768, 154/432], [137/768, 154/432], [137/768, 241/432], [80/768, 241/432]],
    points: [[0.03, 0.62], [0.45, 0.62], [0.45, 0.8], [0.03, 0.8]] },
  { id: "z-pickup", sourceId: "drivethrough", name: "Window 2 (pickup)", role: "pickup", color: "#34d399",
    displayPoints: [[610/768, 157/432], [652/768, 157/432], [652/768, 239/432], [610/768, 239/432]],
    points: [[0.55, 0.62], [0.95, 0.62], [0.95, 0.8], [0.55, 0.8]] },
  { id: "z-exit", sourceId: "drivethrough", name: "Exit", role: "exit", color: "#f472b6",
    points: [[0.95, 0.6], [1, 0.6], [1, 0.85], [0.95, 0.85]] },
];

export interface Settings {
  waitTargetS: number;     // amber at 75%, red over
  sampleEveryS: number;    // segment sampling interval
  segmentLenS: number;     // default segment length
  autoSample: boolean;     // disabled by default
  showZoneLabels: boolean;
  view: "3d" | "map";
}

interface State {
  sourceId: SourceId;
  /** per-source playback time (seconds) */
  times: Record<SourceId, number>;
  playing: boolean;
  rate: number;
  selectedTrackId: string | null;
  settings: Settings;
  zones: Zone[];
  /** observation cache keyed by sourceId then by timestamp string (t.toFixed(2)) */
  observations: Record<SourceId, Record<string, FrameObservation>>;
  demoObservations: Record<SourceId, Record<string, FrameObservation>>;
  demoMode: Record<SourceId, boolean>;
  setDemoMode: (id: SourceId, enabled: boolean) => void;
  analysis: Record<SourceId, AnalysisStatus>;
  ackedAlerts: string[];
  contactReviews: Record<string, "confirmed" | "rejected">;
  /** set by video panel to request a seek */
  seekRequest: { t: number; nonce: number } | null;

  setSource: (id: SourceId) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setRate: (r: number) => void;
  seek: (t: number) => void;
  select: (id: string | null) => void;
  updateSettings: (p: Partial<Settings>) => void;
  upsertZone: (z: Zone) => void;
  deleteZone: (id: string) => void;
  addObservation: (o: FrameObservation) => void;
  clearObservations: (sourceId: SourceId, provenance?: "model" | "synthetic") => void;
  setAnalysis: (sourceId: SourceId, s: AnalysisStatus) => void;
  ackAlert: (id: string) => void;
  reviewContact: (eventId: string, v: "confirmed" | "rejected") => void;
}

const emptyBySource = <T,>(v: () => T): Record<SourceId, T> => ({ drivethrough: v(), aerial: v(), staff: v() });

export const useStore = create<State>()(
  persist(
    (set) => ({
      sourceId: "drivethrough",
      times: emptyBySource(() => 0),
      playing: false,
      rate: 0.5, // slowed by default so sparse boxes are easier to follow
      selectedTrackId: null,
      settings: { waitTargetS: 6, sampleEveryS: 2, segmentLenS: 16, autoSample: false, showZoneLabels: true, view: "3d" },
      zones: PRESET_ZONES,
      observations: emptyBySource(() => ({})),
      demoObservations: emptyBySource(() => ({})),
      demoMode: emptyBySource(() => false),
      setDemoMode: (id, enabled) => set((s) => ({ demoMode: { ...s.demoMode, [id]: enabled } })),
      analysis: emptyBySource(() => ({ kind: "idle" } as AnalysisStatus)),
      ackedAlerts: [],
      contactReviews: {},
      seekRequest: null,

      setSource: (id) => set({ sourceId: id, selectedTrackId: null, playing: false }),
      setTime: (t) => set((s) => ({ times: { ...s.times, [s.sourceId]: t } })),
      setPlaying: (p) => set({ playing: p }),
      setRate: (r) => set({ rate: r }),
      seek: (t) => set((s) => ({ seekRequest: { t, nonce: (s.seekRequest?.nonce ?? 0) + 1 }, times: { ...s.times, [s.sourceId]: t } })),
      select: (id) => set({ selectedTrackId: id }),
      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      upsertZone: (z) => set((s) => ({ zones: [...s.zones.filter((x) => x.id !== z.id), z] })),
      deleteZone: (id) => set((s) => ({ zones: s.zones.filter((x) => x.id !== id) })),
      addObservation: (o) =>
        set((s) => {
          const src = (Object.keys(s.observations) as SourceId[]).find((k) => o.sessionId.startsWith(k)) ?? s.sourceId;
          const field = o.provenance === "synthetic" ? "demoObservations" : "observations";
          return { [field]: { ...s[field], [src]: { ...s[field][src], [o.t.toFixed(2)]: o } } };
        }),
      clearObservations: (sourceId, provenance) =>
        set((s) => {
          if (provenance === "synthetic") return { demoObservations: { ...s.demoObservations, [sourceId]: {} }, demoMode: { ...s.demoMode, [sourceId]: false } };
          const cur = s.observations[sourceId];
          const next = provenance ? Object.fromEntries(Object.entries(cur).filter(([, o]) => o.provenance !== provenance)) : {};
          return { observations: { ...s.observations, [sourceId]: next } };
        }),
      setAnalysis: (sourceId, st) => set((s) => ({ analysis: { ...s.analysis, [sourceId]: st } })),
      ackAlert: (id) => set((s) => ({ ackedAlerts: s.ackedAlerts.includes(id) ? s.ackedAlerts : [...s.ackedAlerts, id] })),
      reviewContact: (eventId, v) => set((s) => ({ contactReviews: { ...s.contactReviews, [eventId]: v } })),
    }),
    {
      name: "lanetwin-v1",
      version: 2,
      migrate: (persisted: unknown) => {
        const old = persisted as Partial<State>;
        const observations = emptyBySource(() => ({} as Record<string, FrameObservation>));
        const demoObservations = emptyBySource(() => ({} as Record<string, FrameObservation>));
        for (const id of Object.keys(observations) as SourceId[]) {
          for (const [t, o] of Object.entries(old.observations?.[id] ?? {})) {
            (o.provenance === "synthetic" ? demoObservations : observations)[id][t] = o;
          }
        }
        return { ...old, observations, demoObservations, demoMode: emptyBySource(() => false), ackedAlerts: (old.ackedAlerts ?? []).map((id) => { const source = id.split(":")[0] as SourceId; const mode = Object.keys(demoObservations[source] ?? {}).length ? "synthetic" : "model"; return id.replace(`${source}:`, `${source}:${mode}:`); }), contactReviews: old.contactReviews ?? {} };
      },
      partialize: (s) => ({
        sourceId: s.sourceId,
        times: s.times,
        settings: s.settings,
        zones: s.zones,
        observations: s.observations,
        demoObservations: s.demoObservations,
        demoMode: s.demoMode,
        ackedAlerts: s.ackedAlerts,
        contactReviews: s.contactReviews,
      }),
    },
  ),
);

/** UI reads one evidence mode at a time; inference always caches model observations separately. */
export const activeObservations = (s: State) => s.demoMode[s.sourceId] ? s.demoObservations[s.sourceId] : s.observations[s.sourceId];
