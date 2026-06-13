import { Router, type IRouter } from "express";
import { createRequire } from "node:module";
import { projectDb, sessionDb } from "../lib/db";
import { logger } from "../lib/logger";

interface ArchiverInstance {
  pipe(destination: NodeJS.WritableStream): void;
  append(source: string | Buffer, options?: { name?: string }): this;
  finalize(): Promise<void>;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "warning", listener: (err: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}
type ArchiverFactory = (format: string, options?: Record<string, unknown>) => ArchiverInstance;

const require = createRequire(import.meta.url);
const createArchiver = require("archiver") as ArchiverFactory;

const router: IRouter = Router();

router.get("/sessions/:sessionId/download", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = sessionDb.get(raw);

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.hasProject) {
    res.status(404).json({ error: "No project generated for this session yet" });
    return;
  }

  const files = projectDb.getFiles(raw);

  const projectName = session.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "woxsom-project";

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${projectName}.zip"`);
  res.setHeader("Cache-Control", "no-cache");

  const archive = createArchiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err: Error) => {
    logger.error({ err: err.message, sessionId: raw }, "Archive stream error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create archive" });
    } else {
      res.destroy();
    }
  });

  archive.on("warning", (err: Error) => {
    logger.warn({ err: err.message, sessionId: raw }, "Archive warning");
  });

  archive.pipe(res);

  for (const file of files) {
    archive.append(Buffer.from(file.content, "utf8"), { name: file.filePath });
  }

  const vsCodeSettings = JSON.stringify(
    {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": "esbenp.prettier-vscode",
      "typescript.preferences.importModuleSpecifier": "relative",
      "editor.tabSize": 2,
      "files.eol": "\n",
      "extensions": {
        "recommendations": [
          "esbenp.prettier-vscode",
          "dbaeumer.vscode-eslint",
          "bradlc.vscode-tailwindcss",
          "ms-vscode.vscode-typescript-next"
        ]
      }
    },
    null,
    2
  );

  const hasVsCode = files.some((f) => f.filePath.includes(".vscode/settings.json"));
  if (!hasVsCode) {
    archive.append(Buffer.from(vsCodeSettings, "utf8"), { name: ".vscode/settings.json" });
  }

  const hasGitignore = files.some((f) => f.filePath === ".gitignore");
  if (!hasGitignore) {
    archive.append(
      Buffer.from("node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store\n", "utf8"),
      { name: ".gitignore" }
    );
  }

  try {
    await archive.finalize();
    logger.info({ sessionId: raw, fileCount: files.length }, "Archive streamed successfully");
  } catch (err) {
    logger.error({ err, sessionId: raw }, "Archive finalize error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to finalize archive" });
    }
  }
});

export default router;
