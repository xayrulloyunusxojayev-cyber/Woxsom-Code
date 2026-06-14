# Woxsom Code — Self-Improvement Roadmap

This file is the living roadmap for Woxsom Code's autonomous self-improvement system.
The Engine Control Room dashboard reads this file directly. Update it to add, prioritize, or close tasks.

---

## Legend
- `[ ]` — Open / Not started
- `[~]` — In Progress
- `[x]` — Complete
- `[!]` — Critical / Blocking

---

## Phase 1 — Foundation (Self-Awareness)

- [x] **ARCH-001** — Implement System/Project boundary: clear separation between user project artifacts and Woxsom Code system source
- [x] **ARCH-002** — Engine Control Room dashboard (file tree, log viewer, ROADMAP viewer)
- [x] **ARCH-003** — Self-Reflective Audit loop (AI scans system source, generates diffs)
- [x] **ARCH-004** — Human-in-the-loop safety layer (Approve/Reject before any system file is modified)
- [x] **ARCH-005** — Patch store with status tracking (pending / approved / rejected)

---

## Phase 2 — Agent Intelligence

- [ ] **AGENT-001** — Add a dedicated "Security Auditor" agent to Group C that checks generated user code for vulnerabilities (OWASP Top 10)
- [ ] **AGENT-002** — Memory agent: persist cross-session context so the Planner can reference prior conversations
- [ ] **AGENT-003** — Self-evaluation: after each pipeline run, the Optimizer scores itself and logs the score for trend analysis
- [ ] **AGENT-004** — Adaptive model selection: track which Groq models produce highest quality scores and auto-promote them
- [ ] **AGENT-005** — Streaming output: replace polling with SSE (Server-Sent Events) for real-time agent message streaming

---

## Phase 3 — Orchestration Improvements

- [ ] **ORCH-001** — Retry-with-reflection: if Critic scores < 60, automatically retry Group B with the critic's feedback injected
- [ ] **ORCH-002** — Parallel file extraction: run Group C (Critic + Optimizer) in parallel instead of sequentially
- [ ] **ORCH-003** — Context budget manager: dynamically allocate token budgets per agent based on project complexity
- [ ] **ORCH-004** — Checkpoint system: save intermediate pipeline state so a failed run can resume from last checkpoint

---

## Phase 4 — Developer Experience

- [ ] **DX-001** — Live file preview: render generated React components in a sandboxed iframe
- [ ] **DX-002** — Project history: version every generated project so users can roll back to a prior generation
- [ ] **DX-003** — Template library: allow saving successful generations as reusable starter templates
- [ ] **DX-004** — Multi-turn refinement: allow users to request changes to an already-generated project and re-run only affected agents

---

## Phase 5 — Infrastructure

- [ ] **INFRA-001** — Migrate JSON file store to SQLite for atomic writes and better concurrency
- [ ] **INFRA-002** — Background job queue: replace `setImmediate` fire-and-forget with a durable task queue
- [ ] **INFRA-003** — Rate limit monitoring: expose per-key rate limit headroom so the router avoids 429s proactively
- [ ] **INFRA-004** — Deployment health check: add `/api/health/deep` that verifies DB integrity and key validity on every deploy

---

## Audit Log

| Date | Audit ID | Files Scanned | Patches Generated | Patches Applied |
|------|----------|---------------|-------------------|-----------------|
| *(audits will be appended here automatically)* | | | | |
