import { Router, type IRouter } from "express";
import { hasGitHubPat, createRepoAndPush, type SyncFile } from "../lib/github";
import { secretsDb } from "../lib/secrets";
import { projectDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** GET /api/github/pat-status — returns whether a PAT is stored */
router.get("/github/pat-status", (_req, res): void => {
  const pat = secretsDb.getGitHubPat();
  res.json({
    configured: pat !== null,
    masked: pat ? pat.slice(0, 8) + "…" + pat.slice(-4) : null,
  });
});

/** POST /api/github/pat — save a Personal Access Token */
router.post("/github/pat", (req, res): void => {
  const { pat } = req.body as { pat?: string };
  if (!pat || pat.trim().length === 0) {
    res.status(400).json({ error: "pat is required" });
    return;
  }
  secretsDb.saveGitHubPat(pat.trim());
  logger.info("GitHub PAT saved via API");
  res.json({ ok: true, masked: pat.trim().slice(0, 8) + "…" + pat.trim().slice(-4) });
});

/** DELETE /api/github/pat — remove the stored PAT */
router.delete("/github/pat", (_req, res): void => {
  secretsDb.deleteGitHubPat();
  logger.info("GitHub PAT removed via API");
  res.json({ ok: true });
});

/** POST /api/github/sync — create/update a repo and push project files */
router.post("/github/sync", async (req, res): Promise<void> => {
  const { sessionId, repoName } = req.body as { sessionId?: string; repoName?: string };

  if (!sessionId || !repoName) {
    res.status(400).json({ error: "sessionId and repoName are required" });
    return;
  }

  if (!hasGitHubPat()) {
    res.status(401).json({ error: "no_token", message: "No GitHub PAT configured. Add one in API Keys." });
    return;
  }

  const dbFiles = projectDb.getFiles(sessionId);
  if (dbFiles.length === 0) {
    res.status(404).json({ error: "No project files found for this session." });
    return;
  }

  const files: SyncFile[] = dbFiles.map((f) => ({ filePath: f.filePath, content: f.content }));

  try {
    const url = await createRepoAndPush(repoName, files);
    res.json({ url });
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ err: msg, sessionId, repoName }, "GitHub sync failed");

    if (msg.includes("No GitHub token")) {
      res.status(401).json({ error: "no_token", message: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
