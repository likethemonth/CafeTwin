import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeFrame } from "../server/analyzeHandler";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const { status, json } = await analyzeFrame(req.body);
  res.status(status).json(json);
}
