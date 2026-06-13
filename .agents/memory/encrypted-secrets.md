---
name: Secrets architecture (plain-text SQLite)
description: How Groq API keys are stored — node:sqlite builtin, plain JSON, no encryption, no native deps.
---

## Rule
API keys are stored as plain JSON text in `artifacts/api-server/data/secrets.db` using Node.js's built-in `node:sqlite` module (Node 22.5+, stable in Node 24). The column is still named `encrypted_value` for schema compatibility, but the value is unencrypted JSON.

**Why:** AES-256-GCM encryption caused persistent decryption failures across Render redeploys because the derived key (from SESSION_SECRET) was not consistent across restarts. Since this is a private internal tool, plain-text storage was chosen for stability.

**How to apply:**
- `secrets.ts` uses `import { DatabaseSync } from 'node:sqlite'`
- NO encryption/decryption — `saveKeys()` calls `JSON.stringify(keys)`, `getKeys()` calls `JSON.parse(row.encrypted_value)`
- No `SESSION_SECRET` or `ENCRYPTION_KEY` env vars needed
- The `EncryptedSecrets` table lives in `artifacts/api-server/data/secrets.db`
- `secretsDb.saveKeys()`, `getKeys()`, `deleteKeys()` are the full public API
- Do NOT re-introduce encryption without user approval
