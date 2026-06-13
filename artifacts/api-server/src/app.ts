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

// Load persisted Groq API keys on startup
const savedKeys = keyDb.get();
if (savedKeys.length > 0) {
  setGroqKeys(savedKeys);
  logger.info({ keyCount: savedKeys.length }, "Loaded persisted Groq API keys");
}

// --- API routes ---
app.use("/api", router);

// --- Frontend static files & SPA fallback ---
const frontendDist = path.resolve(__dirname, "../../woxsom-code/dist");
const frontendExists = fs.existsSync(frontendDist);

if (frontendExists) {
  app.use(express.static(frontendDist));

  // --- Frontend static files & SPA fallback ---
const frontendDist = path.resolve(__dirname, "../../woxsom-code/dist");
const frontendExists = fs.existsSync(frontendDist);

if (frontendExists) {
  app.use(express.static(frontendDist));

  // ИСПОЛЬЗУЕМ ЭТОТ МЕТОД: он работает в Express 5 без вызова path-to-regexp для каждой строки
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Пропускаем все API запросы
    if (req.path.startsWith("/api")) {
      return next();
    }
    
    // Проверяем, запрашивается ли статический файл (содержит точку)
    if (req.path.includes(".")) {
      return next();
    }

    // Отправляем index.html для всех остальных путей
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ status: "API Server running (frontend not found)" });
  });
}
export default app;
