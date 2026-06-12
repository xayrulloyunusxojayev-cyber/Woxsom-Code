# Woxsom Code

A professional multi-agent AI coding assistant that builds complex AI systems, platforms, and SaaS products from user prompts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, serves `/api`)
- `pnpm --filter @workspace/woxsom-code run dev` — run the frontend (port varies, serves `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (artifacts/api-server)
- Frontend: React + Vite + Tailwind CSS (artifacts/woxsom-code)
- Storage: JSON file store (artifacts/api-server/data/) — no database setup required
- AI: Groq API via direct fetch (user provides up to 5 keys)
- ZIP download: archiver package
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas
- `artifacts/api-server/src/lib/db.ts` — JSON file database (sessions, messages, project files, keys)
- `artifacts/api-server/src/lib/groq.ts` — Groq API client with key rotation
- `artifacts/api-server/src/lib/agents.ts` — multi-agent pipeline orchestration
- `artifacts/api-server/src/lib/models.ts` — model definitions and task selection logic
- `artifacts/api-server/data/` — runtime JSON data files (gitignored)

## Architecture decisions

- **JSON file store** instead of PostgreSQL/SQLite — avoids native module compilation issues in Replit, simple enough for session/message persistence.
- **Key rotation** — each Groq API call uses the next key in the pool (round-robin), distributing load across all provided keys.
- **Async pipeline** — agent pipeline runs in a `setImmediate` callback after the HTTP response is sent (fire-and-forget), so the client gets an instant response and polls for status.
- **Multi-agent groups** — Group A (Planner, 1 key), Group B (Frontend + Backend executors, 2 keys in parallel), Group C (Critic + Optimizer, 2 keys in parallel).

## Product

Users enter up to 5 Groq API keys at setup. They then describe any software project in natural language. The app orchestrates 5 AI agents across 3 groups to plan, build, review, and package a complete project. Users see live agent status, read generated code in the chat, and download the full project as a ZIP with VS Code settings.

## Gotchas

- **always run codegen** after any change to `lib/api-spec/openapi.yaml`
- **never import @workspace/db** in api-server routes — the workspace DB requires `DATABASE_URL` which isn't needed here; use `lib/db.ts` (JSON store) instead
- `better-sqlite3` was removed — requires native build scripts that are blocked by pnpm in this environment
- The `archiver` package is CJS-only; import via `createRequire` not ES default import
- `setImmediate` is used for the pipeline to avoid blocking the HTTP response — never `await` the pipeline in the route handler
