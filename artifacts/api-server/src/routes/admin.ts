import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { callGroq, hasGroqKeys } from "../lib/groq";
import { auditStore, patchStore } from "../lib/patch-store";
import { appendLog, getRecentLogs } from "../lib/log-store";
import { sessionDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const SYSTEM_ROOTS: Record<string, string> = {
  "api-server": path.resolve(workspaceRoot, "artifacts/api-server/src"),
  "frontend":   path.resolve(workspaceRoot, "artifacts/woxsom-code/src"),
};

const ROADMAP_PATH = path.resolve(workspaceRoot, "ROADMAP.md");

function isPathSafe(requestedPath: string): boolean {
  const resolved = path.resolve(requestedPath);
  return Object.values(SYSTEM_ROOTS).some((root) => resolved.startsWith(root + path.sep) || resolved === root);
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

function buildFileTree(dir: string): FileNode {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { name: path.basename(dir), path: path.relative(workspaceRoot, dir), type: "directory", children: [] };
  }

  const children: FileNode[] = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "dist", ".cache", ".gitkeep"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      children.push(buildFileTree(fullPath));
    } else {
      children.push({ name: entry.name, path: path.relative(workspaceRoot, fullPath), type: "file" });
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    name: path.basename(dir),
    path: path.relative(workspaceRoot, dir),
    type: "directory",
    children,
  };
}

// ── Robust AI response parser ─────────────────────────────────────────────────
// Handles: section-based (## Issue/Task headers) AND fallback filepath scanning.
// Resilient to blank lines, field reordering, missing filepath: prefix, etc.
function parseAIPatches(text: string, auditId: string): number {
  let patchCount = 0;

  // Extract a single code block from a section of text
  const extractCodeBlocks = (sectionText: string): Array<{ filePath: string; content: string }> => {
    const results: Array<{ filePath: string; content: string }> = [];
    // Matches: ```[lang]\n[optional filepath: line\n]content``` OR ```filepath:path\ncontent```
    const codeRe = /```(?:[a-zA-Z]*)\n(?:(filepath:|path:)([^\n]+)\n)?([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(sectionText)) !== null) {
      const prefixedPath = m[2]?.trim();
      const content = m[3] ?? "";
      if (!content.trim()) continue;

      // Also try to find filepath: anywhere in the preceding 3 lines of the block
      const blockStart = m.index;
      const precedingText = sectionText.slice(Math.max(0, blockStart - 300), blockStart);
      const fileLineMatch = /\*\*File\*\*\s*:\s*([^\n]+)|filepath:\s*([^\n]+)/i.exec(precedingText);

      const rawPath = (prefixedPath ?? fileLineMatch?.[1] ?? fileLineMatch?.[2] ?? "").trim();
      if (!rawPath || rawPath.length < 4 || rawPath.includes(" ")) continue;
      results.push({ filePath: rawPath.replace(/^(filepath:|path:)/i, "").trim(), content: content.trim() });
    }
    return results;
  };

  // Strategy A: parse by ## Issue N / ## Task N section headers
  const headerRe = /^##\s+(?:Issue|Task|Change|Fix|Patch)\s+\d+\s*[:\-–—]\s*(.+)$/gim;
  const headerMatches = [...text.matchAll(headerRe)];

  if (headerMatches.length > 0) {
    for (let i = 0; i < headerMatches.length; i++) {
      const title = headerMatches[i][1].trim();
      const sectionStart = (headerMatches[i].index ?? 0) + headerMatches[i][0].length;
      const sectionEnd = i + 1 < headerMatches.length ? (headerMatches[i + 1].index ?? text.length) : text.length;
      const section = text.slice(sectionStart, sectionEnd);

      // Description = text before first ``` in the section
      const firstFence = section.indexOf("```");
      const descRaw = (firstFence > 0 ? section.slice(0, firstFence) : section.slice(0, 600))
        .replace(/\*\*/g, "")
        .replace(/^[*\-]\s/gm, "")
        .trim();

      const blocks = extractCodeBlocks(section);
      for (const block of blocks.slice(0, 1)) { // one file per issue
        const absolute = path.resolve(workspaceRoot, block.filePath);
        if (!isPathSafe(absolute)) continue;
        const original = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf-8") : "";
        if (block.content === original.trim()) continue;
        patchStore.create(auditId, title, descRaw || title, block.filePath, original, block.content);
        patchCount++;
      }
    }
    return patchCount;
  }

  // Strategy B: fallback — scan entire text for filepath: fences
  const globalRe = /```[a-zA-Z]*\nfilepath:([^\n]+)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = globalRe.exec(text)) !== null) {
    const rawPath = m[1].trim();
    const content = m[2]?.trim() ?? "";
    if (!rawPath || !content) continue;
    const absolute = path.resolve(workspaceRoot, rawPath);
    if (!isPathSafe(absolute)) continue;
    const original = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf-8") : "";
    if (content === original.trim()) continue;
    const title = `Update ${path.basename(rawPath)}`;
    patchStore.create(auditId, title, title, rawPath, original, content);
    patchCount++;
  }
  return patchCount;
}

// ── Read a subset of core system files for AI context ────────────────────────
function readContextFiles(filePaths: string[], maxCharsEach = 3000): string {
  return filePaths
    .filter((f) => {
      const abs = path.resolve(workspaceRoot, f);
      return isPathSafe(abs) && fs.existsSync(abs);
    })
    .map((f) => {
      const raw = fs.readFileSync(path.resolve(workspaceRoot, f), "utf-8");
      const snippet = raw.length > maxCharsEach ? raw.slice(0, maxCharsEach) + "\n// [...truncated]" : raw;
      return "```filepath:" + f + "\n" + snippet + "\n```";
    })
    .join("\n\n");
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/admin/file-tree", (_req, res): void => {
  try {
    const trees = Object.values(SYSTEM_ROOTS).map((root) => buildFileTree(root));
    res.json({ trees });
  } catch (err) {
    logger.error({ err }, "admin file-tree error");
    res.status(500).json({ error: "Failed to build file tree" });
  }
});

router.get("/admin/file", (req, res): void => {
  const { path: filePath } = req.query as { path?: string };
  if (!filePath) { res.status(400).json({ error: "path query param required" }); return; }
  const absolute = path.resolve(workspaceRoot, filePath);
  if (!isPathSafe(absolute)) { res.status(403).json({ error: "Path is outside system boundaries" }); return; }
  if (!fs.existsSync(absolute)) { res.status(404).json({ error: "File not found" }); return; }
  res.json({ path: filePath, content: fs.readFileSync(absolute, "utf-8") });
});

router.get("/admin/roadmap", (_req, res): void => {
  if (!fs.existsSync(ROADMAP_PATH)) { res.status(404).json({ error: "ROADMAP.md not found" }); return; }
  res.json({ content: fs.readFileSync(ROADMAP_PATH, "utf-8") });
});

router.get("/admin/logs", (req, res): void => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "150", 10), 500);
  res.json({ logs: getRecentLogs(limit) });
});

router.get("/admin/audits", (_req, res): void => {
  res.json({ audits: auditStore.list() });
});

router.get("/admin/patches", (req, res): void => {
  const { auditId } = req.query as { auditId?: string };
  res.json({ patches: patchStore.list(auditId) });
});

router.get("/admin/system-info", (_req, res): void => {
  const mem = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    nodeVersion: process.version,
    memoryMB: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    systemRoots: Object.fromEntries(
      Object.entries(SYSTEM_ROOTS).map(([k, v]) => [k, path.relative(workspaceRoot, v)])
    ),
  });
});

// ── Audit ─────────────────────────────────────────────────────────────────────
const CORE_FILES = [
  "artifacts/api-server/src/lib/agents.ts",
  "artifacts/api-server/src/lib/groq.ts",
  "artifacts/api-server/src/lib/db.ts",
  "artifacts/api-server/src/routes/sessions.ts",
];

function collectSystemFiles(): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist"].includes(entry.name)) walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(path.relative(workspaceRoot, full));
      }
    }
  }
  Object.values(SYSTEM_ROOTS).forEach(walk);
  return results;
}

router.post("/admin/audit", async (req, res): Promise<void> => {
  if (!hasGroqKeys()) {
    res.status(400).json({ error: "No Groq API keys configured — add keys via API Keys page first" });
    return;
  }

  const { scope = "core" } = req.body as { scope?: "all" | "core" };
  const filesToScan = scope === "all" ? collectSystemFiles() : CORE_FILES;
  const audit = auditStore.create(filesToScan);
  appendLog("info", "Audit started", { auditId: audit.id, fileCount: filesToScan.length, scope });
  res.json({ auditId: audit.id, fileCount: filesToScan.length, status: "running" });

  setImmediate(async () => {
    try {
      const fileContext = readContextFiles(filesToScan.slice(0, 8));

      const aiResponse = await callGroq(
        "llama-3.3-70b-versatile",
        [
          {
            role: "system",
            content: `You are a senior TypeScript architect auditing Woxsom Code, a multi-agent AI SaaS builder.
Find up to 5 concrete bugs, performance issues, or improvements. For each one output:

## Issue N: <short title>
**Severity**: critical | warning | suggestion
**File**: <exact relative path from workspace root>
**Problem**: <what is wrong and why>
**Fix**: <what you changed>

\`\`\`filepath:<exact relative path>
<COMPLETE corrected file — never truncate, never use placeholders>
\`\`\`

Only produce issues with a real, complete fix. End with:
## Summary
<2–3 sentence overall assessment>`,
          },
          {
            role: "user",
            content: `SYSTEM SOURCE FILES:\n${fileContext}\n\nAudit these files now.`,
          },
        ],
        { maxTokens: 4000, temperature: 0.15 }
      );

      const patchCount = parseAIPatches(aiResponse, audit.id);
      const summaryM = /^##\s+Summary\s*\n([\s\S]+)/im.exec(aiResponse);
      const summary = summaryM ? summaryM[1].trim() : aiResponse.slice(-400).trim();

      auditStore.complete(audit.id, summary, patchCount);
      appendLog("info", "Audit completed", { auditId: audit.id, patchCount });
      logger.info({ auditId: audit.id, patchCount }, "Audit completed");
    } catch (err) {
      const msg = (err as Error).message;
      auditStore.fail(audit.id, msg);
      appendLog("error", "Audit failed", { auditId: audit.id, error: msg });
      logger.error({ auditId: audit.id, err }, "Audit failed");
    }
  });
});

// ── Command Console ───────────────────────────────────────────────────────────
router.post("/admin/command", async (req, res): Promise<void> => {
  if (!hasGroqKeys()) {
    res.status(400).json({ error: "No Groq API keys configured — add keys via API Keys page first" });
    return;
  }

  const { prompt } = req.body as { prompt?: string };
  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required and must not be empty" });
    return;
  }

  const trimmedPrompt = prompt.trim();
  const session = sessionDb.create(`[Cmd] ${trimmedPrompt.slice(0, 60)}`);
  const audit = auditStore.create(["command-console"]);

  appendLog("info", "Command Console: task received", {
    sessionId: session.id,
    auditId: audit.id,
    prompt: trimmedPrompt.slice(0, 80),
  });

  res.json({ commandId: audit.id, sessionId: session.id, status: "running" });

  setImmediate(async () => {
    try {
      const contextFiles = readContextFiles(CORE_FILES.concat([
        "artifacts/api-server/src/routes/admin.ts",
        "artifacts/woxsom-code/src/pages/admin.tsx",
      ]), 2500);

      const aiResponse = await callGroq(
        "llama-3.3-70b-versatile",
        [
          {
            role: "system",
            content: `You are the Lead Architect of Woxsom Code, an AI-native SaaS builder.
A development task has been submitted via the Command Console. Your job:
1. Analyze the task deeply.
2. Identify the exact system files that need to change.
3. Produce atomic, complete file patches — max 4 patches.

For each patch output EXACTLY this format:

## Task N: <short imperative title>
**File**: <relative path from workspace root, e.g. artifacts/api-server/src/lib/agents.ts>
**Changes**: <1–2 sentences: what changes and why>

\`\`\`filepath:<same relative path>
<COMPLETE new file content — no truncation, no TODO, no placeholders>
\`\`\`

Rules:
- Only modify files inside artifacts/api-server/src/ or artifacts/woxsom-code/src/
- Every file you output must be complete and immediately deployable.
- Do not repeat unchanged files.
- End your response with:
## Summary
<2–3 sentences describing the overall change set>`,
          },
          {
            role: "user",
            content: `CURRENT SYSTEM SOURCE:\n${contextFiles}\n\n---\n\nDEVELOPMENT TASK:\n${trimmedPrompt}\n\nDecompose into atomic patches now.`,
          },
        ],
        { maxTokens: 4000, temperature: 0.2 }
      );

      const patchCount = parseAIPatches(aiResponse, audit.id);
      const summaryM = /^##\s+Summary\s*\n([\s\S]+)/im.exec(aiResponse);
      const summary = summaryM
        ? summaryM[1].trim()
        : `Generated ${patchCount} patch${patchCount !== 1 ? "es" : ""} for: ${trimmedPrompt.slice(0, 100)}`;

      auditStore.complete(audit.id, summary, patchCount);
      sessionDb.updateStatus(session.id, patchCount > 0 ? "done" : "error");
      appendLog(
        patchCount > 0 ? "info" : "warn",
        `Command Console: ${patchCount} patches generated`,
        { auditId: audit.id, sessionId: session.id, patchCount }
      );
    } catch (err) {
      const msg = (err as Error).message;
      auditStore.fail(audit.id, msg);
      sessionDb.updateStatus(session.id, "error");
      appendLog("error", "Command Console: agent failed", { auditId: audit.id, error: msg });
      logger.error({ auditId: audit.id, err }, "Command Console agent failed");
    }
  });
});

// ── Patch approval / rejection ────────────────────────────────────────────────
router.post("/admin/patches/:id/approve", async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const patch = patchStore.get(id);
  if (!patch) { res.status(404).json({ error: "Patch not found" }); return; }
  if (patch.status !== "pending") { res.status(400).json({ error: `Patch is already ${patch.status}` }); return; }

  const absolute = path.resolve(workspaceRoot, patch.filePath);
  if (!isPathSafe(absolute)) { res.status(403).json({ error: "File is outside system boundaries" }); return; }

  try {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, patch.proposedContent, "utf-8");
    const resolved = patchStore.resolve(id, "approved");
    appendLog("info", `Patch approved & applied: ${patch.title}`, { patchId: id, filePath: patch.filePath });
    logger.info({ patchId: id, filePath: patch.filePath }, "Patch applied to disk");
    res.json({ success: true, patch: resolved, message: "Applied. Restart the API server to activate." });
  } catch (err) {
    const msg = (err as Error).message;
    appendLog("error", `Failed to apply patch: ${patch.title}`, { patchId: id, error: msg });
    res.status(500).json({ error: `Write failed: ${msg}` });
  }
});

router.post("/admin/patches/:id/reject", (req, res): void => {
  const { id } = req.params as { id: string };
  const patch = patchStore.get(id);
  if (!patch) { res.status(404).json({ error: "Patch not found" }); return; }
  if (patch.status !== "pending") { res.status(400).json({ error: `Patch is already ${patch.status}` }); return; }
  const resolved = patchStore.resolve(id, "rejected");
  appendLog("warn", `Patch rejected: ${patch.title}`, { patchId: id });
  res.json({ success: true, patch: resolved });
});

export default router;
