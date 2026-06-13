import crypto from "node:crypto";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { logger } from "./logger";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, "secrets.db");

const SESSION_SECRET = process.env.SESSION_SECRET ?? "woxsom-default-secret-v1-please-set-in-prod";

const ENCRYPTION_KEY = crypto.scryptSync(SESSION_SECRET, "woxsom-salt-v1", 32);

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

interface SecretRow {
  encrypted_value: string;
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS EncryptedSecrets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_name TEXT NOT NULL UNIQUE,
    encrypted_value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

logger.info({ dbPath: DB_PATH }, "EncryptedSecrets SQLite store initialized");

export const secretsDb = {
  saveKeys(keys: string[]): void {
    const encrypted = encrypt(JSON.stringify(keys));
    const stmt = db.prepare<[string]>(`
      INSERT INTO EncryptedSecrets (key_name, encrypted_value, updated_at)
      VALUES ('groq_api_keys', ?, datetime('now'))
      ON CONFLICT(key_name) DO UPDATE
        SET encrypted_value = excluded.encrypted_value,
            updated_at = excluded.updated_at
    `);
    stmt.run(encrypted);
    logger.info({ keyCount: keys.length }, "Groq API keys saved (encrypted) to SQLite");
  },

  getKeys(): string[] {
    const row = db
      .prepare<[], SecretRow>("SELECT encrypted_value FROM EncryptedSecrets WHERE key_name = 'groq_api_keys'")
      .get() as SecretRow | undefined;
    if (!row) return [];
    try {
      const parsed = JSON.parse(decrypt(row.encrypted_value)) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
    } catch (err) {
      logger.error({ err }, "Failed to decrypt Groq API keys — clearing stored value");
      secretsDb.deleteKeys();
      return [];
    }
  },

  deleteKeys(): void {
    db.prepare("DELETE FROM EncryptedSecrets WHERE key_name = 'groq_api_keys'").run();
    logger.info("Groq API keys deleted from EncryptedSecrets");
  },
};
