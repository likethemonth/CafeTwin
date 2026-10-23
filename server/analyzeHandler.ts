// Core frame-analysis handler shared by the Vercel function and the Vite dev middleware.
// Never logs or returns the API key.
import { FrameObservationSchema } from "../src/types.js";

export interface AnalyzeBody {
  sessionId: string;
  t: number;
  imageDataUrl: string;
  width: number;
  height: number;
}

export interface AnalyzeResult {
  status: number;
  json: unknown;
}

// Aerial frames contain ~150 parked cars; enumerating them all exceeds the timeout.
const AERIAL_FOCUS = `
This is a top-down aerial view. Do NOT list parked cars in the car park or vehicles on the main road.
Only list vehicles in or queuing for the drive-through lane that wraps the small building, at most 15.`;

function buildPrompt(width: number, height: number, focus = ""): string {
  return `You are a careful vision annotator for a drive-through operations dashboard.
The attached image is exactly ${width} pixels wide and ${height} pixels tall. Pixel (0,0) is the top-left corner.
List every VISIBLE vehicle and person in this single frame.${focus}
For each, give a bounding box [xMin, yMin, xMax, yMax] in INTEGER PIXEL coordinates of this image
(0 <= xMin < xMax <= ${width}, 0 <= yMin < yMax <= ${height}).
Box rules:
- The box must be TIGHT: its edges touch the outermost visible pixels of the object itself
  (for vehicles include wheels, mirrors, bumpers and roof; for persons include head, hands and feet).
- Exclude shadows, reflections, ground markings and surrounding background.
- Include objects that are partially visible or cut off at the image edge; box only the visible part.
- One box per object; do not merge adjacent vehicles or people into one box.
- Persons visible only through a vehicle window may be included only if clearly visible; say so in the note.
- Ignore watermark, logo or overlay text.
Also give an optional plain colour (e.g. "black") and an optional short visual note.
Do NOT guess identities, licence plates, names, faces, intent, or whether an order is complete.
Do not invent objects that are not clearly visible. Return JSON only.`;
}

const DETECTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["detections"],
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cls", "bbox", "colour", "note"],
        properties: {
          cls: { type: "string", enum: ["vehicle", "person"] },
          bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
          colour: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
        },
      },
    },
  },
};

function bad(status: number, error: string, message?: string): AnalyzeResult {
  return { status, json: message ? { error, message } : { error } };
}

function extractText(data: any): string | null {
  if (typeof data?.output_text === "string") return data.output_text;
  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c.text === "string") return c.text;
    }
  }
  return null;
}


export async function analyzeFrame(rawBody: unknown): Promise<AnalyzeResult> {
  // Prefer Azure OpenAI (v1 OpenAI-compatible surface, model = deployment name); fall back to OpenAI.
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const useAzure = Boolean(azureEndpoint && azureKey);
  const key = useAzure ? azureKey : process.env.OPENAI_API_KEY;
  if (!key) return bad(503, "not_configured");
  const model = (useAzure ? process.env.AZURE_OPENAI_DEPLOYMENT : process.env.VISION_MODEL) || "gpt-6-astra";
  const url = useAzure ? `${azureEndpoint!.replace(/\/+$/, "")}/responses` : "https://api.openai.com/v1/responses";
  const authHeaders: Record<string, string> = useAzure ? { "api-key": key } : { Authorization: `Bearer ${key}` };

  const body = (typeof rawBody === "string" ? safeParse(rawBody) : rawBody) as Partial<AnalyzeBody> | null;
  if (
    !body ||
    typeof body.sessionId !== "string" ||
    typeof body.t !== "number" ||
    typeof body.imageDataUrl !== "string" ||
    !body.imageDataUrl.startsWith("data:image/") ||
    body.imageDataUrl.length > 1_500_000 || // ~1.1 MB image; frames are ~50 KB JPEGs

    typeof body.width !== "number" ||
    typeof body.height !== "number"
  ) {
    return bad(400, "bad_request", "expected {sessionId, t, imageDataUrl, width, height}");
  }

  // Dimensions of the image actually sent; the model answers in these pixel units and we normalise.
  const imgW = Math.max(1, Math.round(body.width));
  const imgH = Math.max(1, Math.round(body.height));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" }, // detection is perceptual; long reasoning caused timeouts on dense frames
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: buildPrompt(imgW, imgH, body.sessionId.startsWith("aerial") ? AERIAL_FOCUS : "") },
              { type: "input_image", image_url: body.imageDataUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: { type: "json_schema", name: "frame_detections", strict: true, schema: DETECTION_JSON_SCHEMA },
        },
      }),
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") return bad(504, "timeout", "vision provider timed out after 45s");
    return bad(502, "upstream_unreachable", String(e?.message ?? e).slice(0, 200));
  }
  clearTimeout(timer);

  if (resp.status === 429) return bad(429, "rate_limited", "vision provider rate limit");
  if (!resp.ok) {
    let detail = "";
    try {
      const j: any = await resp.json();
      detail = String(j?.error?.message ?? "").slice(0, 300);
    } catch {
      /* ignore */
    }
    return bad(502, "upstream_error", `provider status ${resp.status}${detail ? `: ${detail}` : ""}`);
  }

  let data: any;
  try {
    data = await resp.json();
  } catch {
    return bad(502, "invalid_response", "provider returned non-JSON");
  }
  const text = extractText(data);
  if (!text) return bad(502, "invalid_response", "no output text");
  const parsed = safeParse(text) as any;
  if (!parsed || !Array.isArray(parsed.detections)) return bad(502, "invalid_response", "output was not the expected JSON");

  // Pixel boxes -> normalised 0..1. Reject structurally malformed output; clamp slight overshoot;
  // drop boxes that are degenerate (< 2 px) after clamping.
  if (parsed.detections.some((d: any) => !d || !["vehicle", "person"].includes(d.cls) ||
    !Array.isArray(d.bbox) || d.bbox.length !== 4 ||
    d.bbox.some((v: unknown) => typeof v !== "number" || !Number.isFinite(v)))) {
    return bad(502, "invalid_response", "provider returned invalid detections or bounding boxes");
  }
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const counters = { vehicle: 0, person: 0 };
  const detections = [];
  for (const d of parsed.detections as any[]) {
    let [x0, y0, x1, y1] = d.bbox as number[];
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    const b = [clamp01(x0 / imgW), clamp01(y0 / imgH), clamp01(x1 / imgW), clamp01(y1 / imgH)];
    if ((b[2] - b[0]) * imgW < 2 || (b[3] - b[1]) * imgH < 2) continue;
    const cls = d.cls as "vehicle" | "person";
    counters[cls] += 1;
    detections.push({
      id: `${cls === "vehicle" ? "v" : "p"}${counters[cls]}`,
      cls,
      bbox: b.map((v) => Math.round(v * 10000) / 10000) as [number, number, number, number],
      ...(typeof d.colour === "string" && d.colour ? { colour: d.colour } : {}),
      ...(typeof d.note === "string" && d.note ? { note: d.note } : {}),
    });
  }

  const obs = FrameObservationSchema.safeParse({
    sessionId: body.sessionId,
    t: body.t,
    width: imgW,
    height: imgH,
    detections,
    provenance: "model",
    model,
  });
  if (!obs.success) return bad(502, "invalid_response", obs.error.issues.map((i) => i.message).join("; ").slice(0, 300));
  return { status: 200, json: obs.data };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
