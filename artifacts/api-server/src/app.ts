import express, { type Express } from "express";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { secretsDb } from "./lib/secrets";
import { setGroqKeys } from "./lib/groq";

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

// --- Key loading: encrypted SQLite is the single source of truth ---
// Keys are managed entirely through the Settings UI and stored encrypted in
// the EncryptedSecrets SQLite table. No env vars required.
const storedKeys = secretsDb.getKeys();
if (storedKeys.length > 0) {
  setGroqKeys(storedKeys);
  logger.info({ keyCount: storedKeys.length }, "Loaded Groq API keys from EncryptedSecrets DB");
} else {
  logger.warn("No Groq API keys found — add keys via the Settings page");
}

// --- API routes (mounted first so they always win) ---
app.use("/api", router);

// --- Serve React frontend ---
const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const frontendDist = path.resolve(workspaceRoot, "artifacts/woxsom-code/dist/public");
const indexHtml = path.join(frontendDist, "index.html");

if (fs.existsSync(indexHtml)) {
  logger.info({ frontendDist }, "Serving frontend static files");
  app.use(express.static(frontendDist));

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
