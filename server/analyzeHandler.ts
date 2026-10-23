// Core frame-analysis handler shared by the Vercel function and the Vite dev middleware.
// Never logs or returns the API key.
import { FrameObservationSchema } from "../src/types";

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

const PROMPT = `You are a careful vision annotator for a drive-through operations dashboard.
List only VISIBLE vehicles and persons in this single frame.
For each, give a normalised bounding box [xMin, yMin, xMax, yMax] in 0..1 from the image top-left,
an optional plain colour (e.g. "black"), and an optional short visual note.
Do NOT guess identities, licence plates, names, faces, intent, or whether an order is complete.
Do not invent objects that are not clearly visible. Return JSON only.`;

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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: PROMPT },
              { type: "input_image", image_url: body.imageDataUrl },
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
    if (e?.name === "AbortError") return bad(504, "timeout", "vision provider timed out after 30s");
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

  // Reject malformed provider data rather than clamping or silently discarding boxes.
  if (parsed.detections.some((d: any) => !d || !["vehicle", "person"].includes(d.cls) ||
    !Array.isArray(d.bbox) || d.bbox.length !== 4 ||
    d.bbox.some((v: unknown) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) ||
    d.bbox[0] >= d.bbox[2] || d.bbox[1] >= d.bbox[3])) {
    return bad(502, "invalid_response", "provider returned invalid detections or bounding boxes");
  }
  const counters = { vehicle: 0, person: 0 };
  const detections = parsed.detections
    .filter((d: any) => d && (d.cls === "vehicle" || d.cls === "person") && Array.isArray(d.bbox) && d.bbox.length === 4)
    .map((d: any) => {
      const b = d.bbox;
      const cls = d.cls as "vehicle" | "person";
      counters[cls] += 1;
      return {
        id: `${cls === "vehicle" ? "v" : "p"}${counters[cls]}`,
        cls,
        bbox: [b[0], b[1], b[2], b[3]],
        ...(typeof d.colour === "string" && d.colour ? { colour: d.colour } : {}),
        ...(typeof d.note === "string" && d.note ? { note: d.note } : {}),
      };
    })
    .filter((d: any) => d.bbox[0] < d.bbox[2] && d.bbox[1] < d.bbox[3]);

  const obs = FrameObservationSchema.safeParse({
    sessionId: body.sessionId,
    t: body.t,
    width: Math.max(1, Math.round(body.width)),
    height: Math.max(1, Math.round(body.height)),
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
