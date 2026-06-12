import { Router, type IRouter } from "express";
import { keyDb } from "../lib/db";
import { setGroqKeys } from "../lib/groq";

const router: IRouter = Router();

router.get("/keys", async (req, res): Promise<void> => {
  const keys = keyDb.get();
  res.json({
    configured: keys.length > 0,
    keyCount: keys.length,
    maskedKeys: keys.map((k) => k.slice(0, 8) + "..." + k.slice(-4)),
  });
});

router.post("/keys", async (req, res): Promise<void> => {
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
    maskedKeys: validKeys.map((k) => k.slice(0, 8) + "..." + k.slice(-4)),
  });
});

export default router;
