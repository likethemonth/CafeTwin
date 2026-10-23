# LaneTwin

Camera-assisted digital twin proof of concept for a drive-through coffee kiosk. Replay footage → hosted-vision bounding boxes → lightweight TypeScript tracking → schematic 3D twin, dwell metrics and alerts.

## Run

```bash
pnpm install
cp .env.example .env   # set OPENAI_API_KEY (server-side only)
pnpm dev
```

Without a key, playback, zone editing and a clearly labelled **synthetic** demo session still work; analysis shows "not configured".

## Environment

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | Server-side key for hosted vision. Never exposed to the browser. |
| `VISION_MODEL` | Defaults to `gpt-6-astra` ("Astra"), the identifier found in the local Codex model cache. Not verified against the API during the build. |

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

## Limitations

- Model localisation quality unverified; schema-valid output is not proof of accurate detection.
- Tracking is greedy IoU/centre matching on sparse samples; no re-identification across recordings.
- Vehicles present at clip start have unknown arrival; waits are "observed waiting for…".
- Disappearance is "track lost", never a confirmed exit.
