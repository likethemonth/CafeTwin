import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { analyzeFrame } from "./server/analyzeHandler";

function devAnalyzeApi(): Plugin {
  return {
    name: "lanetwin-dev-analyze",
    configureServer(server) {
      server.middlewares.use("/api/analyze", (req, res, next) => {
        if (req.method !== "POST") return next();
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (c: string) => (raw += c));
        req.on("end", async () => {
          let result: { status: number; json: unknown };
          try {
            result = await analyzeFrame(raw);
          } catch (e) {
            result = { status: 500, json: { error: "internal", message: String((e as Error)?.message ?? e) } };
          }
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.json));
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const k of ["OPENAI_API_KEY", "VISION_MODEL"]) if (env[k] && !process.env[k]) process.env[k] = env[k];
  return {
    plugins: [react(), devAnalyzeApi()],
  };
});
