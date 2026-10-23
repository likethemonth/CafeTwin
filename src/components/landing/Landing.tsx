// LaneTwin landing page: scroll-scrubbed aerial footage explaining the problem,
// then what the control room does and how it separates evidence from estimates.
import { useRef } from "react";
import ScrollLockedVideoHero, { type HeroBeat } from "../ui/scroll-locked-video-hero";
import "./landing.css";

const BEATS: HeroBeat[] = [
  {
    from: 0.17,
    to: 0.42,
    kicker: "The problem",
    text: "A drive-through queue is a black box.",
    sub: "Managers see a line of cars. They don't see how long each one has been waiting, or where it stalls.",
  },
  {
    from: 0.41,
    to: 0.65,
    kicker: "The gap",
    text: "The cameras are already watching.",
    sub: "Footage gets recorded and rarely reviewed. Staffing calls rest on gut feel rather than measured waits.",
  },
  {
    from: 0.64,
    to: 0.87,
    kicker: "What we're building",
    text: "LaneTwin turns recorded footage into an operational twin.",
    sub: "Detect vehicles, track them through queue and pickup zones, and replay every wait on a schematic 3D site.",
  },
];

const PROBLEMS = [
  { h: "Waits are invisible", p: "Nobody can say how long the fourth car in line has been there, or whether it's over the target." },
  { h: "Footage goes unused", p: "Cameras record every shift, but turning hours of video into queue numbers is manual work." },
  { h: "Guesses become metrics", p: "Without per-vehicle timing, bottlenecks at the order point and the pickup window look the same." },
];

const STEPS = [
  { n: "01", h: "Watch", p: "Pick a recording. Each source keeps its own playback clock, zones and tracks. Nothing is mixed across cameras." },
  { n: "02", h: "Detect", p: "A hosted vision model returns vehicle and person bounding boxes for sampled frames, validated against a strict schema." },
  { n: "03", h: "Track & time", p: "Deterministic matching assigns anonymous IDs (V001, P001). Zone polygons with hysteresis measure dwell in queue and pickup." },
  { n: "04", h: "Twin & act", p: "The same vehicle is highlighted in video, 3D twin and journey table. Waits past target raise alerts you can acknowledge." },
];

const EVIDENCE = [
  { cls: "obs", h: "Observed", p: "Boxes returned by the model, stored at their source-video timestamps." },
  { cls: "est", h: "Estimated", p: "Interpolated positions between samples and schematic lane placement in the twin." },
  { cls: "syn", h: "Synthetic", p: "Demo sessions and the staffing what-if. Always labelled, never mixed into measurements." },
];

const RECORDINGS = [
  { src: "/footage/Drivethrough.mp4", h: "Drive-through lane", p: "Fixed side camera. Vehicle detection, queue zones and dwell timing." },
  { src: "/footage/Aerialview.mp4", h: "Aerial view", p: "Drifting top-down drone. Informs the schematic site layout." },
  { src: "/footage/Staffworking.mp4", h: "Staff area", p: "Indoor camera. Person occupancy in work zones." },
];

const ASSESSMENT = [
  {
    cls: "good",
    h: "Strengths",
    items: [
      "End-to-end flow works live: footage → hosted detection → tracks → zones → 3D twin → alert acknowledgement.",
      "Drive-through replay ships 32 real Azure model frames (0–15.5 s, every 0.5 s), so the demo loads with genuine detections.",
      "Strict data model: Zod-validated boxes, source timestamps and provenance on every observation and event.",
      "Honest metrics: unknown arrivals stay unknown, lost tracks are never exits, missing values show “—”, not 0.",
      "Seeking backwards rebuilds state without duplicate alerts; acknowledgements survive refresh.",
      "API keys stay server-side; the app still works, clearly labelled, without credentials.",
    ],
  },
  {
    cls: "weak",
    h: "Weaknesses",
    items: [
      "Tracking is not reliable yet: two similar queued cars can swap or restart IDs, and a missed detection can break a track.",
      "Boxes are exact only on analysed frames; in between they are interpolated estimates.",
      "Box accuracy was checked by eye on a handful of frames, with no measured precision or recall. Overlapping cars can be off by 10–20 px.",
      "Heatmap and Traffic views depend on tracking, so they are marked draft.",
      "Each frame takes roughly 10 s through the hosted model, so live segment analysis is slow.",
    ],
  },
  {
    cls: "limit",
    h: "Limitations",
    items: [
      "About 15 seconds of footage per recording: no shift-level or daily figures.",
      "Schematic twin, not calibrated geometry. No real-world distances.",
      "Aerial (drifting drone) detections are frame-local; no camera-motion compensation.",
      "No cross-camera re-identification; recordings are separate, not synchronised.",
      "State is browser-local: no shared backend, user accounts or audit trail.",
      "No upload flow or rate limiting yet; the analysis endpoint needs access control before wider use.",
    ],
  },
];

const ROADMAP = [
  {
    h: "1 · Denser, cheaper detections",
    p: "Swap per-frame LLM vision for a hosted object detector (e.g. a Roboflow-hosted model) at 5–10 fps. Keep the same adapter and schema, and keep the LLM for occasional verification.",
  },
  {
    h: "2 · A real tracker",
    p: "Replace greedy IoU matching with ByteTrack-style association: a Kalman motion model, Hungarian one-to-one matching and low-confidence second-pass recovery, plus colour and size cues to keep queued cars apart.",
  },
  {
    h: "3 · Measure it",
    p: "Hand-label a few minutes of footage and report ID switches, MOTA/IDF1 and dwell-time error per zone, so tracking changes are judged by numbers rather than screenshots.",
  },
  {
    h: "4 · Deploy for a real site",
    p: "Small edge box or RTSP ingest worker that samples the fixed camera, a Postgres store for observations, tracks and events, and auth plus rate limits on the API. The dashboard stays on Vercel; replay remains labelled until live ingest is verified.",
  },
];

export function Landing({ onEnter }: { onEnter: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollerRef} className="landing">
      <ScrollLockedVideoHero
        scrollerRef={scrollerRef}
        videoSrc="/footage/hero-aerial-scrub.mp4"
        eyebrow="Drive-through digital twin"
        title={<>Lane<span style={{ color: "var(--accent)" }}>Twin</span></>}
        beats={BEATS}
        tagline={<>Every car, every zone, every wait.<br />Measured from footage, labelled when estimated.</>}
        corner={<button className="ld-skip" onClick={onEnter}>Skip to control room →</button>}
      />

      <section className="ld-section">
        <p className="ld-kicker">The problem</p>
        <h2>Drive-through operations run on what managers can see from the window.</h2>
        <div className="ld-grid three">
          {PROBLEMS.map((x) => (
            <article key={x.h} className="ld-card">
              <h3>{x.h}</h3>
              <p>{x.p}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ld-section">
        <p className="ld-kicker">What LaneTwin does</p>
        <h2>From recorded footage to a control room in four steps.</h2>
        <ol className="ld-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="ld-card">
              <span className="ld-num">{s.n}</span>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ld-section">
        <p className="ld-kicker">Source recordings</p>
        <h2>Three separate recordings, analysed separately.</h2>
        <p className="ld-lede">They are not synchronised live cameras. The dashboard calls this an analysed replay, never "live".</p>
        <div className="ld-grid three">
          {RECORDINGS.map((r) => (
            <figure key={r.src} className="ld-card ld-rec">
              <video src={r.src} muted loop autoPlay playsInline preload="metadata" />
              <figcaption>
                <h3>{r.h}</h3>
                <p>{r.p}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="ld-section">
        <p className="ld-kicker">Honest by design</p>
        <h2>Every number says where it came from.</h2>
        <div className="ld-grid three">
          {EVIDENCE.map((e) => (
            <article key={e.h} className={"ld-card ld-ev " + e.cls}>
              <span className="ld-dot" />
              <h3>{e.h}</h3>
              <p>{e.p}</p>
            </article>
          ))}
        </div>
        <p className="ld-lede">
          LaneTwin won't guess identities, licence plates, arrivals before the recording started or whether an order was completed.
          A car that disappears is "track lost", not a confirmed exit. A car present at the start is "observed waiting for…".
        </p>
      </section>

      <section className="ld-section">
        <p className="ld-kicker">Where it stands</p>
        <h2>A working proof of concept, built in an hour. Here's what holds up and what doesn't yet.</h2>
        <div className="ld-grid three">
          {ASSESSMENT.map((col) => (
            <article key={col.h} className={"ld-card ld-list " + col.cls}>
              <h3>{col.h}</h3>
              <ul>{col.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </article>
          ))}
        </div>
        <h3 className="ld-sub">How we'd fix tracking and take it to production</h3>
        <ol className="ld-roadmap">
          {ROADMAP.map((r) => (
            <li key={r.h} className="ld-card">
              <h3>{r.h}</h3>
              <p>{r.p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ld-section ld-cta">
        <h2>See it on the drive-through recording.</h2>
        <p className="ld-lede">Analyse a segment, select the longest wait, jump to its supporting frame and acknowledge the alert.</p>
        <button className="ld-btn" onClick={onEnter}>Open the control room</button>
      </section>

      <footer className="ld-foot">
        Prerecorded footage · Schematic twin, not calibrated geometry · Hero scroll effect adapted from{" "}
        <a href="https://21st.dev/@gughigug" target="_blank" rel="noopener noreferrer">scroll-locked-video-hero</a> by Guglielmo Giannattasio
      </footer>
    </div>
  );
}
