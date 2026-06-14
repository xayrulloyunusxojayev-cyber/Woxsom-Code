import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { callGroq, hasGroqKeys } from "../lib/groq";
import { auditStore, patchStore } from "../lib/patch-store";
import { appendLog, getRecentLogs } from "../lib/log-store";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const SYSTEM_ROOTS: Record<string, string> = {
  "api-server": path.resolve(workspaceRoot, "artifacts/api-server/src"),
  "frontend": path.resolve(workspaceRoot, "artifacts/woxsom-code/src"),
};

const ROADMAP_PATH = path.resolve(workspaceRoot, "ROADMAP.md");

function isPathSafe(requestedPath: string): boolean {
  const resolved = path.resolve(requestedPath);
  return Object.values(SYSTEM_ROOTS).some((root) => resolved.startsWith(root));
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

function buildFileTree(dir: string, rootLabel: string): FileNode {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const children: FileNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(workspaceRoot, fullPath);

    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", ".cache"].includes(entry.name)) continue;
      children.push(buildFileTree(fullPath, rootLabel));
    } else {
      children.push({ name: entry.name, path: relativePath, type: "file" });
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

router.get("/admin/file-tree", (_req, res): void => {
  try {
    const trees = Object.entries(SYSTEM_ROOTS).map(([label, root]) =>
      buildFileTree(root, label)
    );
    res.json({ trees });
  } catch (err) {
    logger.error({ err }, "admin file-tree error");
    res.status(500).json({ error: "Failed to build file tree" });
  }
});

router.get("/admin/file", (req, res): void => {
  const { path: filePath } = req.query as { path?: string };
  if (!filePath) {
    res.status(400).json({ error: "path query param required" });
    return;
  }
  const absolute = path.resolve(workspaceRoot, filePath);
  if (!isPathSafe(absolute)) {
    res.status(403).json({ error: "Path is outside system boundaries" });
    return;
  }
  if (!fs.existsSync(absolute)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const content = fs.readFileSync(absolute, "utf-8");
  res.json({ path: filePath, content });
});

router.get("/admin/roadmap", (_req, res): void => {
  if (!fs.existsSync(ROADMAP_PATH)) {
    res.status(404).json({ error: "ROADMAP.md not found" });
    return;
  }
  const content = fs.readFileSync(ROADMAP_PATH, "utf-8");
  res.json({ content });
});

router.get("/admin/logs", (req, res): void => {
  const limit = parseInt((req.query.limit as string) ?? "150", 10);
  res.json({ logs: getRecentLogs(Math.min(limit, 500)) });
});

router.get("/admin/audits", (_req, res): void => {
  res.json({ audits: auditStore.list() });
});

router.get("/admin/patches", (req, res): void => {
  const { auditId } = req.query as { auditId?: string };
  res.json({ patches: patchStore.list(auditId) });
});

function collectSystemFiles(): Array<{ relativePath: string; absolute: string }> {
  const results: Array<{ relativePath: string; absolute: string }> = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist"].includes(entry.name)) walk(full);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
        results.push({ relativePath: path.relative(workspaceRoot, full), absolute: full });
      }
    }
  }

  Object.values(SYSTEM_ROOTS).forEach(walk);
  return results;
}

router.post("/admin/audit", async (req, res): Promise<void> => {
  if (!hasGroqKeys()) {
    res.status(400).json({ error: "No Groq API keys configured — add keys in API Keys page first" });
    return;
  }

  const { scope = "core" } = req.body as { scope?: "all" | "core" };

  const coreFiles = [
    "artifacts/api-server/src/lib/agents.ts",
    "artifacts/api-server/src/lib/groq.ts",
    "artifacts/api-server/src/lib/db.ts",
    "artifacts/api-server/src/routes/sessions.ts",
  ];

  const filesToScan = scope === "all"
    ? collectSystemFiles().map((f) => f.relativePath)
    : coreFiles.filter((f) => fs.existsSync(path.resolve(workspaceRoot, f)));

  const audit = auditStore.create(filesToScan);
  appendLog("info", "Audit started", { auditId: audit.id, fileCount: filesToScan.length, scope });

  res.json({ auditId: audit.id, fileCount: filesToScan.length, status: "running" });

  setImmediate(async () => {
    try {
      const fileSections = filesToScan
        .filter((f) => {
          const abs = path.resolve(workspaceRoot, f);
          return isPathSafe(abs) && fs.existsSync(abs);
        })
        .slice(0, 8)
        .map((f) => {
          const content = fs.readFileSync(path.resolve(workspaceRoot, f), "utf-8");
          const snippet = content.length > 3000 ? content.slice(0, 3000) + "\n// [...truncated]" : content;
          return `\`\`\`filepath:${f}\n${snippet}\n\`\`\``;
        })
        .join("\n\n");

      const prompt = `You are a senior TypeScript architect auditing the Woxsom Code multi-agent AI coding platform.

SYSTEM SOURCE FILES:
${fileSections}

Your task:
1. Identify up to 5 concrete bugs, performance issues, or improvements in these files.
2. For each issue, produce the COMPLETE corrected file content (not just the changed lines).

RESPONSE FORMAT — strictly follow this structure:

## Issue 1: <short title>
**Severity**: critical | warning | suggestion
**File**: <exact relative file path>
**Problem**: <1–3 sentences describing the bug or improvement>
**Fix**: <1–2 sentences describing what you changed>

\`\`\`filepath:<exact relative file path>
<complete corrected file content>
\`\`\`

## Issue 2: ...

Only output issues where you have a concrete, correct fix. Do not output placeholder code.
End with: ## Summary\n<2–3 sentence overall assessment>`;

      const aiResponse = await callGroq(
        "llama-3.3-70b-versatile",
        [
          { role: "system", content: "You are a meticulous code auditor. Output only the structured format requested. Write complete, correct TypeScript." },
          { role: "user", content: prompt },
        ],
        { maxTokens: 4000, temperature: 0.15 }
      );

      const issueRegex =
        /## Issue \d+: (.+)\n\*\*Severity\*\*: (\w+)\n\*\*File\*\*: (.+)\n\*\*Problem\*\*: ([\s\S]+?)\*\*Fix\*\*: ([\s\S]+?)```filepath:([^\n]+)\n([\s\S]+?)```/g;

      let match;
      let patchCount = 0;

      while ((match = issueRegex.exec(aiResponse)) !== null) {
        const [, title, , filePath, problem, fix, codeFilePath, newContent] = match;
        const targetPath = (codeFilePath || filePath).trim();
        const absolute = path.resolve(workspaceRoot, targetPath);

        if (!isPathSafe(absolute)) continue;

        const originalContent = fs.existsSync(absolute)
          ? fs.readFileSync(absolute, "utf-8")
          : "";

        if (!newContent?.trim() || newContent.trim() === originalContent.trim()) continue;

        patchStore.create(
          audit.id,
          title.trim(),
          `**Problem:** ${problem.trim()}\n\n**Fix:** ${fix.trim()}`,
          targetPath,
          originalContent,
          newContent.trim()
        );
        patchCount++;
      }

      const summaryMatch = /## Summary\n([\s\S]+)$/.exec(aiResponse);
      const summary = summaryMatch ? summaryMatch[1].trim() : aiResponse.slice(-500).trim();

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

router.post("/admin/patches/:id/approve", async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const patch = patchStore.get(id);

  if (!patch) {
    res.status(404).json({ error: "Patch not found" });
    return;
  }
  if (patch.status !== "pending") {
    res.status(400).json({ error: `Patch is already ${patch.status}` });
    return;
  }

  const absolute = path.resolve(workspaceRoot, patch.filePath);
  if (!isPathSafe(absolute)) {
    res.status(403).json({ error: "File is outside system boundaries — cannot apply" });
    return;
  }

  try {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, patch.proposedContent, "utf-8");

    const resolved = patchStore.resolve(id, "approved");
    appendLog("info", `Patch approved and applied: ${patch.title}`, {
      patchId: id,
      filePath: patch.filePath,
    });
    logger.info({ patchId: id, filePath: patch.filePath }, "Patch approved and applied to disk");

    res.json({ success: true, patch: resolved, message: "Patch applied to disk. Restart the API server to pick up changes." });
  } catch (err) {
    const msg = (err as Error).message;
    appendLog("error", `Failed to apply patch: ${patch.title}`, { patchId: id, error: msg });
    res.status(500).json({ error: `Failed to write file: ${msg}` });
  }
});

router.post("/admin/patches/:id/reject", (req, res): void => {
  const { id } = req.params as { id: string };
  const patch = patchStore.get(id);

  if (!patch) {
    res.status(404).json({ error: "Patch not found" });
    return;
  }
  if (patch.status !== "pending") {
    res.status(400).json({ error: `Patch is already ${patch.status}` });
    return;
  }

  const resolved = patchStore.resolve(id, "rejected");
  appendLog("warn", `Patch rejected: ${patch.title}`, { patchId: id });
  res.json({ success: true, patch: resolved });
});

router.get("/admin/system-info", (_req, res): void => {
  const memUsage = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    nodeVersion: process.version,
    memoryMB: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    systemRoots: Object.fromEntries(
      Object.entries(SYSTEM_ROOTS).map(([k, v]) => [k, path.relative(workspaceRoot, v)])
    ),
    workspaceRoot,
  });
});

export default router;
