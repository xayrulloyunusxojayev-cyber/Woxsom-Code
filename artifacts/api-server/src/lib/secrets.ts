import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { logger } from "./logger";
import { appendLog } from "./log-store";
import { DATA_DIR } from "./data-dir";

const DB_PATH = path.join(DATA_DIR, "secrets.db");

interface SecretRow {
  encrypted_value: string;
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS EncryptedSecrets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_name TEXT NOT NULL UNIQUE,
    encrypted_value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`);

const storageMode =
  process.env["RENDER"] === "true"
    ? "Render persistent disk (/var/data)"
    : process.env["DATA_DIR"]
      ? `custom DATA_DIR (${DATA_DIR})`
      : "local dev storage";

logger.info({ dbPath: DB_PATH }, "EncryptedSecrets SQLite store initialized (plain-text mode)");
appendLog("info", `EncryptedSecrets DB initialised — ${storageMode}`, { dbPath: DB_PATH });

export const secretsDb = {
  /** GitHub Personal Access Token ─────────────────────────────────────────── */
  saveGitHubPat(pat: string): void {
    db.prepare(`
      INSERT INTO EncryptedSecrets (key_name, encrypted_value, updated_at)
      VALUES ('github_pat', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT(key_name) DO UPDATE
        SET encrypted_value = excluded.encrypted_value,
            updated_at      = excluded.updated_at
    `).run(pat);
    logger.info("GitHub PAT saved to SQLite");
    appendLog("info", "GitHub PAT saved to persistent storage", { dbPath: DB_PATH });
  },

  getGitHubPat(): string | null {
    const row = db
      .prepare("SELECT encrypted_value FROM EncryptedSecrets WHERE key_name = 'github_pat'")
      .get() as SecretRow | undefined;
    return row?.encrypted_value ?? null;
  },

  deleteGitHubPat(): void {
    db.prepare("DELETE FROM EncryptedSecrets WHERE key_name = 'github_pat'").run();
    logger.info("GitHub PAT deleted from EncryptedSecrets");
    appendLog("info", "GitHub PAT deleted from persistent storage", { dbPath: DB_PATH });
  },

  /** Groq API Keys ─────────────────────────────────────────────────────────── */
  saveKeys(keys: string[]): void {
    const value = JSON.stringify(keys);
    db.prepare(`
      INSERT INTO EncryptedSecrets (key_name, encrypted_value, updated_at)
      VALUES ('groq_api_keys', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT(key_name) DO UPDATE
        SET encrypted_value = excluded.encrypted_value,
            updated_at      = excluded.updated_at
    `).run(value);
    logger.info({ keyCount: keys.length }, "Groq API keys saved to SQLite");
    appendLog("info", `Groq API keys saved — ${keys.length} key${keys.length !== 1 ? "s" : ""} written to persistent storage`, { dbPath: DB_PATH });
  },

  getKeys(): string[] {
    const row = db
      .prepare("SELECT encrypted_value FROM EncryptedSecrets WHERE key_name = 'groq_api_keys'")
      .get() as SecretRow | undefined;
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.encrypted_value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
    } catch (err) {
      logger.error({ err }, "Failed to parse Groq API keys from SQLite");
      appendLog("error", "Failed to parse Groq API keys from persistent storage", { dbPath: DB_PATH });
      return [];
    }
  },

  deleteKeys(): void {
    db.prepare("DELETE FROM EncryptedSecrets WHERE key_name = 'groq_api_keys'").run();
    logger.info("Groq API keys deleted from EncryptedSecrets");
    appendLog("info", "Groq API keys deleted from persistent storage", { dbPath: DB_PATH });
  },
};
