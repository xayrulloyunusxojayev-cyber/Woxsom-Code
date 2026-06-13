---
name: Encrypted secrets architecture
description: How Groq API keys are stored — node:sqlite builtin + AES-256-GCM, no native modules.
---

## Rule
API keys are stored encrypted in `artifacts/api-server/data/secrets.db` using Node.js's built-in `node:sqlite` module (available in Node 22.5+, stable in Node 24). Do NOT re-introduce `better-sqlite3` or any other native SQLite binding.

**Why:** `better-sqlite3` requires `node-gyp` / Python for native compilation. On Render (and many CI environments) this fails when no prebuilt binary matches the runtime. `node:sqlite` is built into Node.js 24 — zero install, zero compilation.

**How to apply:**
- `secrets.ts` uses `import { DatabaseSync } from 'node:sqlite'`
- Encryption: AES-256-GCM with key derived via `crypto.scryptSync(SESSION_SECRET, 'woxsom-salt-v1', 32)`
- `SESSION_SECRET` env var is optional — there is a hardcoded fallback for zero-config deployments
- The `EncryptedSecrets` table lives in `artifacts/api-server/data/secrets.db`
- `secretsDb.saveKeys()`, `getKeys()`, `deleteKeys()` are the full public API
