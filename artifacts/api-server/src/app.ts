import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { keyDb } from "./lib/db";
import { setGroqKeys } from "./lib/groq";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const savedKeys = keyDb.get();
if (savedKeys.length > 0) {
  setGroqKeys(savedKeys);
  logger.info({ keyCount: savedKeys.length }, "Loaded persisted Groq API keys");
}

app.use("/api", router);

// --- Расширенная логика поиска фронтенда ---
// __dirname указывает на папку, где лежит скомпилированный app.js (обычно api-server/dist)
const possiblePaths = [
  path.resolve(__dirname, "../../woxsom-code/dist"),
  path.resolve(__dirname, "../woxsom-code/dist"),
  path.resolve(process.cwd(), "woxsom-code/dist"),
  path.resolve(process.cwd(), "dist")
];

const foundPath = possiblePaths.find(p => fs.existsSync(p));

if (foundPath) {
  app.use(express.static(foundPath));
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(foundPath, "index.html"));
  });
} else {
  // Если не нашли, выводим отладочную информацию
  app.get("/", (_req, res) => {
    res.json({ 
      status: "Frontend not found",
      message: "API is working, but couldn't locate build folder",
      searched: possiblePaths,
      cwd: process.cwd(),
      dirname: __dirname
    });
  });
}

export default app;
