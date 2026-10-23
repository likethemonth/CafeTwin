Build **LaneTwin**, a polished proof of concept for a camera-assisted digital twin of a drive-through coffee shop.

This is a one-hour technical assessment. Build a complete, deployable product with working interactions, useful operational logic and a strong visual demonstration.

I have example footage. Use it as the starting point. Keep computer vision lightweight by calling a hosted vision model and rendering bounding boxes in the browser. Do not install or run local ML models.

## 1. Core experience

The main demonstration should be:

**Watch footage → see detected vehicles or people with bounding boxes → select a tracked object → see its corresponding position and timeline in the digital twin.**

A manager should be able to understand:

- Where vehicles are waiting.
- How many vehicles are visible in each queue.
- How long a vehicle has been observed in a zone.
- Which waits exceed a configurable target.
- What is directly observed versus estimated.

Make the app feel like a small operational control room.

## 2. Supplied footage

Look for these files in the project:

- `Example_Footage/Aerialview.mp4`
- `Example_Footage/Drivethrough.mp4`
- `Example_Footage/Staffworking.mp4`

Check exact paths and capitalisation. If the folder is elsewhere, locate it before asking me.

Inspect video metadata and representative frames from each video. Establish:

- Duration, resolution and frame rate.
- Whether the camera is fixed or moving.
- Whether footage contains cuts or speed changes.
- Which objects and operational zones are actually visible.
- Whether any clips genuinely show overlapping events.

Do not infer video contents solely from filenames.

Suggested roles, subject to inspection:

- Aerialview: understand the site layout and queue geometry.
- Drivethrough: vehicle detection, queue zones and dwell-time measurement.
- Staffworking: person detection and occupancy in operational zones.

Treat them as separate recordings unless timestamps or visible events establish synchronisation. Do not pretend they are three synchronised live cameras.

Use a source selector. Each recording should retain its own playback time, observations, tracks and zone configuration.

The supplied screenshot shows the filenames; it is not video data. If the actual MP4s are missing, build the upload workflow and report the missing files without pretending to have analysed them.

## 3. References and repositories

### WareTwin: main visual and interaction reference

Repository:
https://github.com/WayneChou-bot/WareTwin

Live demo:
https://ware-twin.vercel.app/

Study its:
- Dominant central 3D view.
- Compact operational panels.
- Entity selection and inspector.
- Camera panel.
- Event log.
- Playback and scenario controls.

Adapt these patterns to a coffee kiosk, queue lanes, vehicles and staff markers.

Inspect relevant code before reusing it. Do not assume WareTwin provides a general-purpose detector or bounding-box tracker. Its most useful role here is the twin interface and shared-state architecture.

Avoid importing its entire warehouse system. Preserve attribution and licence notices for code you reuse.

### Roboflow: bounding boxes, zones and time-in-zone

Repository:
https://github.com/roboflow/supervision

Example:
https://github.com/roboflow/supervision/tree/develop/examples/time_in_zone

Example README:
https://github.com/roboflow/supervision/blob/develop/examples/time_in_zone/README.md

Use this as a reference for:
- Coloured zone polygons.
- Object IDs.
- Bounding-box labels.
- Time spent in zones.

Implement the necessary rendering and timing logic in TypeScript. Do not add local Python inference just to run this example.

### 3D rendering

React Three Fiber:
https://github.com/pmndrs/react-three-fiber

Documentation:
https://docs.pmnd.rs/react-three-fiber

Drei:
https://github.com/pmndrs/drei

Optional Next.js starter:
https://github.com/pmndrs/react-three-next

### Hosted vision references

Roboflow inference documentation:
https://inference.roboflow.com/

SAM 3:
https://github.com/facebookresearch/sam3

These are optional integration references. We do not need segmentation masks or local SAM for this POC. Plain bounding boxes are sufficient.

## 4. Architecture

Choose a simple stack:

- React and TypeScript.
- Next.js if server routes simplify inference and deployment; otherwise Vite plus a small backend.
- React Three Fiber and Drei.
- SVG or canvas for bounding-box overlays.
- Zod for validating external data.
- A lightweight shared state store.
- Browser persistence for settings, analysis results and alert acknowledgements.

Use a server-side adapter for hosted vision.

No CUDA, PyTorch, local model weights, training pipeline or GPU infrastructure.

Keep the app usable when no model key is configured, but clearly distinguish demo data from actual analysis.

## 5. Hosted vision

I can use a hosted vision model referred to as Astra. Inspect the available project configuration and verify the real provider, model identifier and supported image-input interface.

Do not invent an API endpoint or model name.

Use server-side environment variables. Never send provider credentials to the browser or log secrets.

If an existing hosted Roboflow detector is available and easier to integrate, use it behind the same adapter after verifying the endpoint.

The app should expose:

- Analyse current frame.
- Analyse a short segment.
- Optional automatic sampling, disabled by default.

Start with current-frame analysis, then add segment processing.

For a short segment, sample a configurable number of frames, initially around one frame every two seconds. Keep the default segment small and the request count bounded. Increase sampling only if testing shows association needs it and the request budget allows it.

Show progress, cancellation and useful errors. Cache results so replay and seeking do not repeatedly call the API.

Use source-video timestamps for every observation.

## 6. Vision output

Ask the model for visible objects and bounding boxes only.

Return a validated structure containing:

- Session ID.
- Frame timestamp.
- Source image width and height.
- Detections, each with:
  - Frame-local detection ID.
  - Class: vehicle or person.
  - Bounding box.
  - Optional coarse colour/type.
  - Optional uncertainty note.

Define bounding boxes as:

`[xMin, yMin, xMax, yMax]`

Coordinates must be normalised to 0–1, measured from the image’s top-left corner.

Validate coordinate ordering, bounds and class values. Reject malformed responses. Never fabricate boxes after a failed request.

Treat any model-reported confidence as uncalibrated. Do not invent confidence values if the provider does not return them.

The vision model must not guess:
- A person’s identity or employment status.
- Licence plates.
- An arrival that happened before the recording.
- Whether an order was completed.
- Physical distances without calibration.
- Persistent object identities across separate recordings.

## 7. Lightweight tracking

Use deterministic TypeScript logic to associate detections across nearby sampled frames.

A simple matcher is sufficient:
- Same object class.
- Bounding-box overlap.
- Centre displacement.
- Maximum time gap.
- Optional coarse appearance cues.

Enforce one-to-one matching. If a match is ambiguous, mark it uncertain or begin a new track.

Assign anonymous IDs such as `V001` and `P001`.

Maintain:
- First observed time.
- Last observed time.
- Position samples.
- Zone history.
- Visibility status.
- Association uncertainty.

Do not interpret disappearance as a confirmed exit. Require an exit-zone or line-crossing observation.

Do not attempt cross-camera re-identification.

For moving-camera footage, restrict analysis to frame-local boxes unless camera motion is handled. Fixed image-space zones cannot represent stationary ground areas when the camera moves.

Reset tracking across scene cuts.

## 8. Bounding-box overlay

Render boxes using SVG or canvas over the HTML video element.

Each box should show:
- Anonymous track ID.
- Object class where helpful.
- Observed dwell time when zone membership is established.

Use:
- Blue for selection.
- Green for normal.
- Amber for approaching the wait target.
- Red for exceeding the target.
- Grey for uncertain or stale observations.

Correctly account for:
- Original video dimensions.
- Resizing.
- Letterboxing from `object-fit: contain`.
- Fullscreen.
- Seeking.
- Playback speed.

The overlay and digital twin must use the video’s current time as their shared clock.

Render actual observations at their timestamps. Between close observations of the same track, interpolate for visual smoothness and mark the position as estimated.

Do not draw stale boxes indefinitely. Hide or fade them after a defined gap.

Ignore late API responses for old sessions. Store results under their original timestamps instead of attaching them to whichever frame is currently playing.

## 9. Digital twin

Create a simple, attractive isometric coffee-shop scene.

Use the aerial footage to inform a schematic layout if suitable. Do not claim accurate 3D reconstruction.

Include:
- Small coffee kiosk.
- Visible drive-through lanes.
- Pickup window or windows.
- Queue entry and exit.
- Simple procedural vehicle models.
- Zone overlays.
- Camera markers where useful.

Use the lane count and arrangement supported by the footage; default to a generic two-lane schematic only when the layout cannot be determined.

Interactions:
- Orbit, pan and zoom.
- Reset view.
- Switch between 3D and top-down map.
- Select a vehicle.
- Highlight the same vehicle in video, twin and table.
- Show the selected vehicle’s timeline.
- Toggle zone labels.

Use simple geometry instead of spending time sourcing complex assets.

Map detections to schematic lane progress using configured polygons and centreline paths. Label the mapping “schematic”.

Do not place a vehicle on an arbitrary lane when mapping is unavailable. It can remain visible in the camera panel with “unmapped” status.

For Staffworking footage, show a simple operational-zone map or occupancy view when a reliable relationship to the outdoor twin is unavailable. Do not invent staff movement between recordings.

## 10. Zones and events

Allow configuring a small set of polygons on a paused frame:

- Queue.
- Pickup.
- Exit.
- Optional staff work area.

Provide a simple zone editor:
- Click to place vertices.
- Close polygon.
- Name the zone.
- Assign its role.
- Save or delete.

Include sensible preset zones only after inspecting the footage.

Use the lower centre of the bounding box as an approximate membership point. Apply repeated-observation confirmation or hysteresis to prevent boundary flicker.

Generate events such as:
- First observed.
- Zone entered.
- Zone exited.
- Exit crossed.
- Track lost.
- Wait threshold exceeded.
- Candidate contact.
- Manually confirmed contact.

Person/car proximity may suggest candidate contact. It must not automatically confirm an order was taken.

Let the user confirm or reject candidate contact if this feature fits the time budget.

Vehicles present at the start of the recording have unknown arrival times. Show “observed waiting for…” rather than asserting a complete customer wait.

## 11. Data and metrics

Use typed records for:

- VideoSession.
- FrameObservation.
- Detection.
- Track.
- Zone.
- OperationalEvent.
- Alert.
- Scenario.

Every derived event should retain its supporting timestamp and provenance:
- Model observation.
- Rule-based inference.
- Manual confirmation.
- Synthetic data.

Calculate metrics from these records in code.

Show:
- Current observed queue count.
- Longest observed zone dwell.
- Completed observed exits.
- Confirmed first-contact times where available.
- Queue length over the analysed period.

Missing values stay null. They must not become zero.

Show the analysed interval and eligible sample count. Do not present a short clip as a full day of operations.

Seeking backwards must reproduce the earlier state without duplicate alerts or accumulated counts.

## 12. Dashboard design

Match the feel of WareTwin: a dense but readable operational interface.

Header:
- LaneTwin.
- Generic site label.
- Recording selector.
- Replay/analysis status.
- Playback controls and source timestamp.

Left sidebar:
- Queue count.
- Longest observed wait.
- Completed exits.
- Analysis coverage.
- Active alerts.

Centre:
- Large 3D twin.
- 3D / map toggle.
- Zone labels.
- Timeline beneath.

Right sidebar:
- Camera footage with bounding boxes.
- Analyse controls.
- Selected-object details.
- Recent events.

Bottom:
- Vehicle journey table.
- Queue chart.
- Optional scenario comparison.

Use charcoal/navy backgrounds, subtle borders, readable white text, restrained cyan/blue accents and monospaced operational numbers.

The scene and footage should receive most of the space. Avoid decorative charts, oversized cards and heavy glow.

Never show a “LIVE” badge for prerecorded footage. Use “Replay” or “Analysed replay”.

All visible controls must perform an action.

## 13. Manager workflow

Implement one complete workflow:

1. Open the drive-through recording.
2. Analyse a short segment.
3. See detected vehicles and zone occupancy.
4. Select a vehicle with a long observed wait.
5. Jump to the supporting frame.
6. Inspect its timeline.
7. Acknowledge the alert.
8. Retain the acknowledgement after refresh.

This workflow is more important than adding many unfinished features.

## 14. Optional staffing simulation

Only after the core video-to-twin workflow works, add a small “What if?” panel.

Compare one versus two order-takers with a deterministic queue simulation.

Use identical arrivals and service requirements for both runs. Model pickup capacity separately so adding an order-taker cannot magically remove a pickup bottleneck.

Show assumptions and label the output “simulated”.

Keep this scenario separate from observed footage. Changing staffing must not alter recorded vehicle trajectories or measured metrics.

## 15. Demo mode and failures

If credentials are missing:
- Keep video playback and zone editing available.
- Explain that analysis needs configuration.
- Offer a clearly labelled synthetic demo session separately.

If an API call fails:
- Show the error.
- Keep previous valid results.
- Allow retry.
- Do not silently substitute synthetic detections.

Handle:
- Empty detections.
- Invalid responses.
- Timeouts and rate limits.
- Unsupported video.
- Missing files.
- Track gaps.
- Moving cameras.
- Scene cuts.
- WebGL failure, with a 2D fallback.

Persist settings and review state. Do not persist provider credentials or large uploaded videos in localStorage.

## 16. Implementation priorities

Keep scope realistic for one hour.

Build in this order:

1. Inspect footage, scaffold the app and establish deployment.
2. Video playback with correctly aligned overlay.
3. Hosted current-frame analysis with validated output.
4. Short-segment observations and lightweight tracking.
5. Synchronised schematic twin and object selection.
6. Zones, dwell metrics and alert acknowledgement.
7. Optional staffing simulation and polish.

Use a working thin slice early. If time runs short, remove optional features and document limitations.

Do not spend the hour installing complex model infrastructure or porting the complete WareTwin codebase.

## 17. Validation

Check the behaviours most likely to break:

- Boxes align when resized or fullscreen.
- Coordinates correspond to the correct source frame.
- Switching recordings does not mix tracks.
- Seeking backwards reconstructs the correct metrics.
- Association is one-to-one.
- Lost tracks are not counted as confirmed departures.
- Unknown arrivals remain unknown.
- Acknowledged alerts persist.
- Failed analysis never appears as successful detection.
- API keys stay server-side.
- The deployed app loads and its core workflow works.

Be candid about localisation and tracking quality. Schema-valid model output is not proof of accurate detection.

## 18. Deliverables

Provide:
- Working application.
- GitHub URL if repository access is available.
- Verified deployment URL if deployment access is available.
- README covering setup, environment variables, footage sources, reused code and limitations.
- Clear explanation of observed, estimated and synthetic behaviour.
- Complete original coding-agent logs required by the assessment.

Keep client-identifying information out of the project and logs from the start. Do not clean or selectively rewrite the logs afterwards.

Do not claim tests, deployment or model integration succeeded without verifying them.

Start by locating and inspecting the three videos, reviewing the relevant reference code, and implementing the smallest complete video-to-twin workflow.