# LaneTwin

Camera-assisted digital twin proof of concept for a drive-through coffee kiosk. Replay footage → hosted-vision bounding boxes → lightweight TypeScript tracking → schematic 3D twin, dwell metrics and alerts.

## Run

```bash
pnpm install
cp .env.example .env   # configure Azure or OpenAI server-side
pnpm dev
```

Without a key, playback, zone editing and a clearly labelled **synthetic** demo session still work; analysis shows "not configured".

## Environment

| Var | Purpose |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI v1 base URL, ending `/openai/v1/`; the adapter appends `responses`. |
| `AZURE_OPENAI_API_KEY` | Server-side Azure key; Azure is preferred when both endpoint and key exist. |
| `AZURE_OPENAI_DEPLOYMENT` | Azure deployment name; defaults to `gpt-6-astra`. |
| `OPENAI_API_KEY` | Server-side key for hosted vision. Never exposed to the browser. |
| `VISION_MODEL` | Defaults to `gpt-6-astra` ("Astra"), the identifier found in the local Codex model cache. OpenAI fallback access is unverified. Azure image-input access was verified locally with a real frame on 2026-10-23. |

## Footage

`public/footage/*.mp4` (copied from `Example_Footage/`). All 768×432.
- **Drivethrough** (15.8 s): fixed side camera, single lane, Window 1 and Window 2. Used for vehicle detection, zones and dwell.
- **Aerialview** (15.3 s): top-down drone with drift. Informs schematic layout only; detections are frame-local and unmapped.
- **Staffworking** (10.7 s): indoor; person occupancy only.

Clips are treated as separate, unsynchronised recordings.

## Observed vs estimated vs synthetic

- **Observed**: boxes returned by the hosted model at their source timestamps.
- **Estimated**: interpolated boxes between close observations (dashed), schematic lane positions in the twin.
- **Rule-based**: zone entry/exit (bottom-centre + hysteresis), wait alerts, candidate contacts.
- **Synthetic**: demo session and the What-if staffing simulation, always labelled.

## Reused code

UI patterns and base stylesheet adapted from [WareTwin](https://github.com/WayneChou-bot/WareTwin) (MIT, © 2026 Wayne Chou) — see `docs/third_party/WareTwin-LICENSE.txt`. Zone/time-in-zone concepts follow Roboflow `supervision` examples (no code imported).

Landing page hero (`src/components/ui/scroll-locked-video-hero.tsx`) adapted from [scroll-locked-video-hero](https://21st.dev/@gughigug) by Guglielmo Giannattasio, rewritten to lock its own scroll container and release at the end of the video. It scrubs `public/footage/hero-aerial-scrub.mp4`, a re-encode of `Aerialview.mp4` with a keyframe every 6 frames for smooth seeking. The landing page is at `/landing`; the control room is at `/`.

## Limitations

- Model localisation quality unverified; schema-valid output is not proof of accurate detection.
- Tracking is greedy IoU/centre matching on sparse samples; no re-identification across recordings.
- Vehicles present at clip start have unknown arrival; waits are "observed waiting for…".
- Disappearance is "track lost", never a confirmed exit.

- The twin is schematic, not calibrated geometry. Zone membership maps horizontal image position into a role-specific lane segment; detections outside configured lane zones remain unmapped. Editing polygons does not rebuild the kiosk geometry.
- Aerial detections use separate frame-local IDs. No camera stabilisation, cross-recording identity, or reliable scene-cut detector is implemented (fixed-camera tracking has only a weak cut heuristic).
- Zone membership uses bottom-centre points and repeated samples; sparse sampling can miss short visits. An observed exit-zone detection is not proof of a completed order.
- Synthetic demo observations have a separate browser cache and evidence mode. They never overwrite model results or suppress real analysis. **Analyse current frame/segment** returns to model evidence; **Load synthetic demo** shows fabricated overlays, not annotations of the underlying footage. Alert acknowledgements are scoped by recording and evidence mode.
- Azure current-frame analysis was verified locally. Production segment analysis returned validated model observations at 12.2 and 14.2 seconds (two and three detections). Box accuracy, recall, identity stability and staffing assumptions have not been quantitatively evaluated.
- Browser-local settings, observations, playback times and acknowledgements persist; there is no shared backend or multi-user audit trail. Clearing browser storage clears them. Large videos and credentials are not stored there.
- The bundled clips are the only supported sources; upload, missing-video recovery, robust scene-cut handling and production authentication/rate limiting remain unfinished. Keep hosted inference credentials off an unrestricted public deployment until access controls are added.
- Desktop layout was checked at 1440×900 and 1280×800. Mobile layout is not validated. The lazy-loaded 3D bundle is large; a 2D map is available.
- Original coding-agent session logs are not packaged in this repository. The assessment still requires the original, unmodified exports; this README and verification notes are not substitutes.

## Synthetic manager walkthrough

1. Choose **Drive-through lane**, then **Load synthetic demo** (fabricated observations, no model request).
2. Set **Wait target (s)** to **3** and scrub to roughly **12 seconds**.
3. Click the Window 2 wait alert. It selects V001 and jumps to its supporting 10-second sample.
4. Inspect the selected object's zone timeline and sample buttons; selection is shared with video, map and journey table.
5. Click **Ack**, then refresh. The alert remains acknowledged and playback time is restored.
6. Scrub backwards to 0 seconds: later alerts disappear; scrub forward to reproduce them without duplicates.

## Verification and deployment

Production: https://lanetwin.vercel.app — HTTP 200, rendered dashboard, synthetic manager workflow and a two-frame hosted segment verified in headless Chromium on 2026-10-23.

Repository: https://github.com/likethemonth/CafeTwin

```bash
pnpm build
npx --yes tsx scripts/verify-logic.ts
vercel --prod --yes
```

Headless Chromium checks covered the synthetic workflow, acknowledgement after reload, source isolation, backward seeking, shared selection, canvas sizing, zone editor framing and normal/resized/fullscreen SVG coordinates. The final clean local UI run had no console errors. Provider validation checks use fixtures and do not establish detection quality. Browser screenshots are saved locally under `output/playwright/` (gitignored).

## Footage-matched default replay

The default drive-through replay includes 32 cached Azure model observations at 0.5-second intervals (0–15.5 s) from the bundled clip, generated on 2026-10-23. No API request is needed to replay them. The separate synthetic button still loads illustrative paths; those are not footage annotations. Model paint descriptions now colour vehicle bodies; alert/selection colours remain on labels and outlines. Unknown paint uses a neutral grey. The tracker rejects coarse colour mismatches and hides a track when a newer analysed frame does not contain it. Positions between samples are estimated; fast motion, occlusions and ambiguous identities remain limitations. Colours are coarse visual descriptions, not exact paint measurements.
