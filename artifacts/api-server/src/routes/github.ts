import { Router, type IRouter } from "express";
import {
  getOAuthUrl,
  exchangeCodeAndStore,
  hasGitHubToken,
  clearGitHubToken,
  createRepoAndPush,
  type SyncFile,
} from "../lib/github";
import { projectDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Redirect the user to GitHub OAuth. state = sessionId for post-auth routing. */
router.get("/github/auth", (req, res): void => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  // If the session already has a valid token, skip re-auth and go straight back.
  if (hasGitHubToken(sessionId)) {
    res.redirect(`/chat/${encodeURIComponent(sessionId)}?github_ready=1`);
    return;
  }
  try {
    const url = getOAuthUrl(sessionId);
    res.redirect(url);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ err: msg }, "GitHub OAuth URL generation failed");
    res.status(500).json({ error: msg });
  }
});

/** GitHub redirects here after the user authorises the app. */
router.get("/github/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined; // state = sessionId

  // If GitHub sent back an error (e.g. user denied access)
  const ghError = req.query.error as string | undefined;
  if (ghError) {
    const desc = (req.query.error_description as string | undefined) ?? ghError;
    logger.warn({ ghError, sessionId: state }, "GitHub OAuth denied by user");
    const dest = state ? `/chat/${encodeURIComponent(state)}` : "/";
    res.redirect(`${dest}?github_error=${encodeURIComponent(desc)}`);
    return;
  }

  if (!state) {
    res.status(400).send("Missing state parameter from GitHub callback.");
    return;
  }

  // If there's no code but we already have a token, just redirect back as success.
  if (!code) {
    if (hasGitHubToken(state)) {
      res.redirect(`/chat/${encodeURIComponent(state)}?github_ready=1`);
    } else {
      res.redirect(`/chat/${encodeURIComponent(state)}?github_error=${encodeURIComponent("No authorization code received")}`);
    }
    return;
  }

  try {
    await exchangeCodeAndStore(code, state);
    // Redirect to the specific chat session so ChatPage can pick up the flag.
    res.redirect(`/chat/${encodeURIComponent(state)}?github_ready=1`);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ err: msg, sessionId: state }, "GitHub OAuth callback failed");
    res.redirect(`/chat/${encodeURIComponent(state)}?github_error=${encodeURIComponent(msg)}`);
  }
});

/** Check whether a GitHub user token exists for the given session. */
router.get("/github/token-status", (req, res): void => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  res.json({ connected: hasGitHubToken(sessionId) });
});

/** Disconnect / clear the stored GitHub token for a session. */
router.delete("/github/token", (req, res): void => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  clearGitHubToken(sessionId);
  logger.info({ sessionId }, "GitHub token cleared");
  res.json({ ok: true });
});

/** Create (or update) a GitHub repo and push the generated project files. */
router.post("/github/sync", async (req, res): Promise<void> => {
  const { sessionId, repoName } = req.body as {
    sessionId?: string;
    repoName?: string;
  };

  if (!sessionId || !repoName) {
    res.status(400).json({ error: "sessionId and repoName are required" });
    return;
  }

  if (!hasGitHubToken(sessionId)) {
    res.status(401).json({ error: "no_token", message: "GitHub account not connected. Please authenticate first." });
    return;
  }

  const dbFiles = projectDb.getFiles(sessionId);
  if (dbFiles.length === 0) {
    res.status(404).json({ error: "No project files found for this session." });
    return;
  }

  const files: SyncFile[] = dbFiles.map((f) => ({
    filePath: f.filePath,
    content: f.content,
  }));

  try {
    const url = await createRepoAndPush(sessionId, repoName, files);
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
