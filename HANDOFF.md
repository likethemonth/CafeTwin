# LaneTwin — Codex handoff

Spec: `claude.md` (source of truth). Stack: Vite + React 18 + TS + zustand + zod + R3F/Drei. Vercel serverless `api/analyze.ts`.

## Built by Claude agents (first ~20 min)
- `src/types.ts`, `src/store.ts`, `src/logic/contract.ts` — shared contract (domain records, store, Derived interface).
- `api/analyze.ts`, `server/analyzeHandler.ts`, `vite.config.ts` — hosted-vision adapter (OpenAI Responses API, model `VISION_MODEL` default `gpt-6-astra`, found in local Codex model cache — NOT verified against the API; no key in env at build time).
- `src/vision/client.ts` — frame capture, current-frame + segment analysis, cache, cancel.
- `src/demo/synthetic.ts` — clearly labelled synthetic session.
- `src/logic/tracker.ts`, `src/logic/derive.ts` — tracking, zones w/ hysteresis, events, alerts, metrics.
- `src/components/twin/*` — 3D twin, 2D map, WebGL fallback, staff occupancy view.
- `src/components/video/*` — video + SVG overlay (letterbox aware), zone editor, analyse panel.
- `src/components/shell`, `src/components/panels`, `src/App.tsx`, `src/logic/sim.ts` — dashboard, inspector, events, journey table, queue chart, timeline, what-if sim.

## Footage findings (inspected)
- All 3 clips 768x432. Drivethrough 15.8s fixed side cam, single lane, Window 1 + Window 2, stock watermark. Aerial 15.3s top-down drone, slow drift, lane wraps building. Staff 10.7s indoor. Not synchronised.

## Codex TODO (priority order)
1. `pnpm build` must pass — fix type/integration errors between agent-built modules.
2. `pnpm dev`, open http://localhost:5173, run manager workflow (claude.md §13) with "Load synthetic demo": select vehicle with long wait → jump to frame → inspect timeline → ack alert → refresh → ack persists.
3. Verify overlay alignment on resize/fullscreen; seeking back reproduces metrics without duplicate alerts.
4. If OPENAI_API_KEY available: test /api/analyze on Drivethrough current frame; verify model id. Otherwise leave "not configured" UX.
5. README.md: finish limitations section; git commit; deploy `vercel --prod` if logged in (verify URL loads).
