import { Router, type IRouter } from "express";
import { secretsDb } from "../lib/secrets";
import { setGroqKeys, getGroqKeys, hasGroqKeys } from "../lib/groq";

const router: IRouter = Router();

router.get("/keys", (_req, res): void => {
  const activeKeys = getGroqKeys();
  const configured = activeKeys.length > 0;

  res.json({
    configured,
    keyCount: activeKeys.length,
    source: "stored" as const,
    readonly: false,
    maskedKeys: activeKeys.map((k) => k.slice(0, 8) + "..." + k.slice(-4)),
  });
});

router.post("/keys", (req, res): void => {
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

  const existing = secretsDb.getKeys();
  const merged = Array.from(new Set([...existing, ...validKeys])).slice(0, 5);

  secretsDb.saveKeys(merged);
  setGroqKeys(merged);

  req.log.info({ keyCount: merged.length }, "API keys merged and saved to EncryptedSecrets");

  res.json({
    configured: true,
    keyCount: merged.length,
    source: "stored" as const,
    readonly: false,
    maskedKeys: merged.map((k) => k.slice(0, 8) + "..." + k.slice(-4)),
  });
});

router.delete("/keys", (_req, res): void => {
  secretsDb.deleteKeys();
  setGroqKeys([]);

  res.json({ configured: false, keyCount: 0, source: "stored" as const, readonly: false, maskedKeys: [] });
});

export { hasGroqKeys };
export default router;
