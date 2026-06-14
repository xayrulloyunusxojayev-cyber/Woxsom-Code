# Woxsom Code — Architect's Roadmap

> **System DNA** — Every item below is governed by six principles:
> 1. **Style Consistency** — TypeScript/React, internal utils only, no bloat
> 2. **Competitive Intelligence** — Match or exceed Claude Code · Cursor · Bolt.new · v0.dev
> 3. **Deep Intent Analysis** — Features ship with full UX, validation, and error paths
> 4. **Autonomy & Evolution** — Slow paths get rewritten; the system self-optimises
> 5. **Feature Richness** — Commercial-grade quality; nothing ships half-built
> 6. **Self-Consistency** — Core project-generation logic is never broken by a patch

---

## Legend
- `[ ]` — Queued
- `[~]` — In Progress
- `[x]` — Shipped
- `[!]` — Blocking / Critical
- `[-]` — Deprioritised

---

## Phase 0 — Operational Foundation *(complete)*

- [x] **OPS-001** — pnpm monorepo with Vite + Express + Tailwind dark-mode shell
- [x] **OPS-002** — Multi-agent pipeline: Group A (Planner) → Group B (Executor × 2, parallel) → Group C (Critic + Optimizer)
- [x] **OPS-003** — Round-robin Groq key pool with exponential-backoff retry
- [x] **OPS-004** — JSON file store for sessions, messages, project files; SQLite for secrets
- [x] **OPS-005** — GitHub PAT sync — auto-create repo + commit all files
- [x] **OPS-006** — ZIP download with `.vscode/settings.json` baked in
- [x] **OPS-007** — Engine Control Room: file-tree viewer, log store, ROADMAP renderer
- [x] **OPS-008** — Self-Reflective Audit loop — AI scans own source, generates diffs
- [x] **OPS-009** — Human-in-the-loop patch approval with LCS diff viewer

---

## Phase 1 — Real-Time Everything *(highest priority)*
> **Gap vs. competitors**: Cursor and Claude Code stream tokens live. Our polling model feels slow and hides agent intelligence from the user.

- [!] **RT-001** — **SSE Streaming** — Replace `GET /status` polling with a `GET /sessions/:id/stream` Server-Sent Events endpoint. Each agent token, tool call, and status change pushes immediately to the client. *Eliminates the 1.5s polling gap; matches Claude Code's live terminal feel.*

- [ ] **RT-002** — **Token-level agent output** — Pipe Groq's streaming API (`stream: true`) through to the SSE channel so the user sees agent output character-by-character. *Matches Bolt.new's live code generation feel.*

- [ ] **RT-003** — **Agent thought traces** — Surface the chain-of-thought reasoning (Step 1/2/3 blocks in agent prompts) as collapsible trace nodes in the pipeline panel. *Mirrors Claude's extended thinking disclosure.*

- [ ] **RT-004** — **Progress persistence** — If the browser tab closes mid-pipeline, reconnecting re-subscribes to the in-flight SSE stream. Use a per-session `ReadableStream` held in memory.

---

## Phase 2 — Session Memory & Context Intelligence
> **Gap vs. competitors**: Cursor has `@codebase` semantic search. Claude Code has `CLAUDE.md` persistent memory. We forget everything between sessions.

- [ ] **MEM-001** — **Session memory store** — After each completed pipeline, extract and persist: tech stack chosen, key architectural decisions, file structure, quality score. Store in `data/memory.json` keyed by session ID.

- [ ] **MEM-002** — **Cross-session context injection** — The Planner prompt optionally includes a summary of the user's last 3 completed projects ("You've previously built X with Y stack"). Reduces redundant planning, improves stack consistency.

- [ ] **MEM-003** — **`WOXSOM.md` project intelligence file** — Automatically generate a `WOXSOM.md` in every ZIP output that documents the project's architecture, agent decisions, and how to extend it. *Equivalent to Claude's `CLAUDE.md`.*

- [ ] **MEM-004** — **`@session` context reference** — Allow the user to type `@session:<id>` in a prompt to inject prior session context into a new pipeline run.

---

## Phase 3 — Diff-First Code Review (Cursor Composer Pattern)
> **Gap vs. competitors**: Cursor's Composer shows a unified PR-style diff across all files before writing anything. Our Critic just appends corrections to the chat.

- [ ] **DIFF-001** — **Pre-commit diff gate** — Before `projectDb.saveFiles()` is called, compute a structured diff between Executor output and Critic corrections. Surface this in a new `DiffReviewPanel` component.

- [ ] **DIFF-002** — **File-level accept/reject** — User can accept all, reject all, or toggle individual files in the diff gate. Only accepted files land in the ZIP and GitHub sync.

- [ ] **DIFF-003** — **Inline comment support** — User can leave a text note on any diff hunk. Notes are injected back into a re-run of the Critic agent as correction context.

- [ ] **DIFF-004** — **Auto-apply threshold** — If Critic quality score ≥ 85/100 with no critical issues, skip the diff gate and auto-accept. Configurable in Settings.

---

## Phase 4 — Image & Multimodal Input
> **Gap vs. competitors**: Bolt.new accepts screenshot uploads and generates matching code. v0.dev generates from Figma exports. We only accept text.

- [ ] **IMG-001** — **Screenshot-to-UI** — Accept image uploads in the chat input. Pass the image as a base64 data URL in the Groq vision-capable model call (e.g., `llava-v1.5-7b` or `meta-llama/llama-4-scout-17b-16e-instruct`). Frontend Executor receives the image as UI spec.

- [ ] **IMG-002** — **Design file import** — Accept a URL to a Figma frame (via Figma export link) and extract the design as a layout description fed to the Frontend Executor.

- [ ] **IMG-003** — **Asset bundling** — Uploaded images are embedded in the generated project under `public/assets/` and referenced correctly in generated code.

---

## Phase 5 — Template & Starter System
> **Gap vs. competitors**: Bolt.new's template picker drives 40%+ of new projects. We start from a blank prompt every time.

- [ ] **TPL-001** — **Template library UI** — A grid of starter cards on the setup page: `SaaS Dashboard`, `REST API + Admin Panel`, `E-commerce Store`, `Real-time Chat App`, `AI Chatbot`, `Blog CMS`, `Mobile-first PWA`. Each card pre-fills a high-quality prompt.

- [ ] **TPL-002** — **Save-as-template** — After a successful generation (quality score ≥ 80), user can click "Save as Template". The planner output and prompt are saved to `data/templates.json`.

- [ ] **TPL-003** — **Community template format** — Templates are stored as portable JSON (`prompt`, `plannerOutput`, `techStack`). Future: shareable via URL slug.

- [ ] **TPL-004** — **Smart prompt suggestion** — As the user types in the chat input, suggest the closest matching template name in a subtle autocomplete chip.

---

## Phase 6 — Orchestration Intelligence
> **Goal**: Retry-with-reflection, adaptive model routing, context budget management — making the pipeline self-healing and self-optimising.

- [ ] **ORCH-001** — **Retry-with-reflection** — If Critic score < 60/100, automatically re-run Group B with the full critic feedback injected into the executor prompts. Max 2 retries. Show retry count in the pipeline panel.

- [ ] **ORCH-002** — **Adaptive model promotion** — After each pipeline, log `{ model, qualityScore, latencyMs }` to `data/model_metrics.json`. A weekly cron (or on-demand trigger in Engine Control Room) promotes the highest-scoring model to primary for each task type.

- [ ] **ORCH-003** — **Context budget manager** — Dynamically calculate token budgets per agent based on project complexity (simple CRUD vs. full-stack SaaS). Short projects get faster, smaller models; complex ones get full context.

- [ ] **ORCH-004** — **Checkpoint + resume** — Save intermediate pipeline state after each Group completes. If the process crashes mid-pipeline, reconnecting resumes from the last checkpoint rather than restarting.

- [ ] **ORCH-005** — **Parallel Group C** — Run Critic and Optimizer concurrently with `Promise.all`. Currently sequential; parallelising saves ~15–25s per run.

---

## Phase 7 — Developer Experience & Polish
> **Goal**: Match the UX bar of a $20/month commercial product.

- [ ] **DX-001** — **Multi-turn refinement** — After a project is generated, the user can send a follow-up message ("Add a dark mode toggle" / "Change the DB to Postgres"). A lightweight `RefineAgent` re-runs only the affected files, not the full pipeline.

- [ ] **DX-002** — **Live component preview** — Render generated React components in a sandboxed iframe (reusing the existing `mockup-sandbox` infrastructure already in the monorepo).

- [ ] **DX-003** — **Project version history** — Keep the last 5 generations per session. A "Versions" button lets the user restore a prior generation. Stored in `data/project_versions.json`.

- [ ] **DX-004** — **Keyboard-first UX** — `Cmd+Enter` sends, `Cmd+K` opens session switcher, `Cmd+/` focuses chat input from any page. Match Cursor's keyboard-driven feel.

- [ ] **DX-005** — **Mobile-responsive layout** — The current layout breaks below 768px. Ship a responsive sidebar (sheet/drawer pattern) so the product is usable on tablets.

---

## Phase 8 — Infrastructure Hardening

- [ ] **INFRA-001** — **SQLite for all persistence** — Migrate `sessions.json`, `messages.json`, `project_files.json` from JSON file store to SQLite with WAL mode. Eliminates write-race conditions under concurrent pipeline runs.

- [ ] **INFRA-002** — **Durable job queue** — Replace `setImmediate` fire-and-forget with an in-process queue (e.g., `p-queue` with concurrency 3). Prevents memory leaks on long-running sessions; gives accurate queue position to the UI.

- [ ] **INFRA-003** — **Rate limit headroom monitor** — Track per-key request counts and Groq's `x-ratelimit-remaining-requests` header. Route each pipeline call to the key with the most headroom instead of strict round-robin.

- [ ] **INFRA-004** — **Deep health check** — `GET /api/health/deep` verifies: DB read/write, at least one valid Groq key, disk space > 100MB. Used by deployment platform for readiness probes.

- [ ] **INFRA-005** — **Structured error taxonomy** — Replace generic `Error` throws with a typed `WoxsomError` class (`{ code, message, retryable, userFacing }`). The UI surfaces user-facing messages and suppresses internal stack traces.

---

## Audit Trail

| Date | Audit ID | Files Scanned | Patches Generated | Approved | Rejected |
|------|----------|---------------|-------------------|----------|----------|
| *(auto-populated by Engine Control Room)* | | | | | |

---

## Architect's Notes

**Why SSE before everything else (RT-001):**
Every major competitor — Claude Code, Cursor, Bolt.new — streams. The perceived speed of a streaming response is 3–5× faster than equivalent polling even at the same underlying generation speed. This is a UX multiplier, not just a technical detail.

**Why Diff Gate before Memory (DIFF-001 before MEM-001):**
Users who can see exactly what the AI wrote — and selectively accept it — trust the system far more. Trust drives retention. Memory improves quality but only benefits returning users; the diff gate benefits every single generation from day one.

**On model selection:**
Groq's `llama-3.3-70b-versatile` is the correct default for planning and review. `llama-3.1-8b-instant` remains the right choice for fast frontend generation. Watch for `meta-llama/llama-4-scout` and `llama-4-maverick` as they mature — both show stronger code generation benchmarks and should be A/B tested via ORCH-002.

**System boundary:**
`artifacts/api-server/src/` and `artifacts/woxsom-code/src/` are the system boundary. User project files live exclusively in `data/project_files.json` and `data/sessions.json`. The Engine Control Room enforces this boundary at the API level (`isPathSafe()`). No patch may ever expose or modify user data.
