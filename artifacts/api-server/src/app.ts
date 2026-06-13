import express, { type Express } from "express";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { keyDb } from "./lib/db";
import { loadEnvKeys, setGroqKeys, getKeySource } from "./lib/groq";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Key loading: env vars are the source of truth on Render ---
// 1. Try environment variables GROQ_KEY_1 … GROQ_KEY_5 first.
// 2. Fall back to the JSON file store only when no env keys are present.
const envKeyCount = loadEnvKeys();
if (envKeyCount === 0) {
  const savedKeys = keyDb.get();
  if (savedKeys.length > 0) {
    setGroqKeys(savedKeys);
    logger.info({ keyCount: savedKeys.length }, "Loaded persisted Groq API keys from file store");
  }
}
logger.info({ source: getKeySource() }, "Key source after startup");

// --- API routes (mounted first so they always win) ---
app.use("/api", router);

// --- Serve React frontend ---
// Resolve workspace root regardless of cwd at startup.
const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

// Vite outputs to artifacts/woxsom-code/dist/public (see vite.config.ts outDir)
const frontendDist = path.resolve(workspaceRoot, "artifacts/woxsom-code/dist/public");
const indexHtml = path.join(frontendDist, "index.html");

if (fs.existsSync(indexHtml)) {
  logger.info({ frontendDist }, "Serving frontend static files");
  app.use(express.static(frontendDist));

  // SPA fallback — Express 5 requires a named wildcard segment
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  logger.warn({ frontendDist }, "Frontend build not found — serving API only");
  app.get("/", (_req, res) => {
    res.json({ status: "API running", note: "Frontend not built" });
  });
}

export default app;
