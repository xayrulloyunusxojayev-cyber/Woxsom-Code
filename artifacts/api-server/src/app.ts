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

// --- API routes ---
app.use("/api", router);

// --- Frontend static files & SPA fallback ---
// Список путей, где может находиться собранный фронтенд
const possiblePaths = [
  path.resolve(__dirname, "../../woxsom-code/dist"), 
  path.resolve(__dirname, "../woxsom-code/dist"),
  path.resolve(process.cwd(), "woxsom-code/dist"),
  path.resolve(process.cwd(), "dist")
];

const foundPath = possiblePaths.find(p => fs.existsSync(p));

if (foundPath) {
  app.use(express.static(foundPath));

  // Используем регулярное выражение /.*/ для перехвата всех путей.
  // В Express 5 это обходит PathError, возникающую при использовании '*'
  app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
    // Если путь начинается с /api, это API-запрос, пропускаем его
    if (req.path.startsWith("/api")) return next();
    
    // Для всего остального отдаем index.html (для работы SPA)
    res.sendFile(path.join(foundPath, "index.html"), (err) => {
      if (err) next(err);
    });
  });
} else {
  // Если не нашли фронтенд, выводим отладочный JSON
  app.get("/", (_req, res) => {
    res.json({ 
      status: "Frontend not found",
      message: "API is working, but couldn't locate build folder",
      searchedPaths: possiblePaths,
      cwd: process.cwd()
    });
  });
}

export default app;
