import { Router, type IRouter } from "express";
import { keyDb } from "../lib/db";
import { setGroqKeys, getGroqKeys, getKeySource } from "../lib/groq";

const router: IRouter = Router();

router.get("/keys", (_req, res): void => {
  const source = getKeySource();
  const activeKeys = getGroqKeys();

  res.json({
    configured: activeKeys.length > 0,
    keyCount: activeKeys.length,
    source,
    readonly: source === "env",
    maskedKeys: activeKeys.map((k) => k.slice(0, 8) + "..." + k.slice(-4)),
  });
});

router.post("/keys", (req, res): void => {
  // When keys come from env vars, reject UI changes — env is the source of truth
  if (getKeySource() === "env") {
    res.status(403).json({
      error:
        "API keys are loaded from environment variables and cannot be changed via the UI. " +
        "Update GROQ_KEY_1 … GROQ_KEY_5 in your Render dashboard instead.",
    });
    return;
  }

  const { keys } = req.body as { keys: string[] };

  if (!Array.isArray(keys) || keys.length === 0) {
    res.status(400).json({ error: "keys must be a non-empty array" });
    return;
  }

  const validKeys = keys.filter((k) => typeof k === "string" && k.trim().length > 0);
  if (validKeys.length === 0) {
    res.status(400).json({ error: "No valid API keys provided" });
    return;
  }

  keyDb.save(validKeys);
  setGroqKeys(validKeys);

  req.log.info({ keyCount: validKeys.length }, "API keys updated");

  res.json({
    configured: true,
    keyCount: validKeys.length,
    source: "stored" as const,
    readonly: false,
    maskedKeys: validKeys.map((k) => k.slice(0, 8) + "..." + k.slice(-4)),
  });
});

export default router;
