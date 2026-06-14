import path from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
mkdirSync(dataDir, { recursive: true });

const PATCHES_FILE = path.join(dataDir, "patches.json");
const AUDITS_FILE = path.join(dataDir, "audits.json");

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export type PatchStatus = "pending" | "approved" | "rejected";

export interface Patch {
  id: string;
  auditId: string;
  title: string;
  description: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diffLines: DiffLine[];
  status: PatchStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DiffLine {
  type: "keep" | "add" | "remove";
  line: string;
  lineNo: number;
}

export interface Audit {
  id: string;
  summary: string;
  filesScanned: string[];
  patchCount: number;
  status: "running" | "done" | "error";
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

function computeDiff(original: string, proposed: string): DiffLine[] {
  const a = original.split("\n");
  const b = proposed.split("\n");
  const m = a.length;
  const n = b.length;

  if (m > 600 || n > 600) {
    const lines: DiffLine[] = [];
    b.forEach((line, i) => lines.push({ type: "add", line, lineNo: i + 1 }));
    return lines;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "keep", line: a[i - 1], lineNo: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", line: b[j - 1], lineNo: j });
      j--;
    } else {
      result.unshift({ type: "remove", line: a[i - 1], lineNo: i });
      i--;
    }
  }
  return result;
}

export const auditStore = {
  create(filesScanned: string[]): Audit {
    const audits = readJson<Audit[]>(AUDITS_FILE, []);
    const audit: Audit = {
      id: uuidv4(),
      summary: "",
      filesScanned,
      patchCount: 0,
      status: "running",
      createdAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };
    audits.unshift(audit);
    writeJson(AUDITS_FILE, audits);
    return audit;
  },

  complete(id: string, summary: string, patchCount: number): void {
    const audits = readJson<Audit[]>(AUDITS_FILE, []);
    const audit = audits.find((a) => a.id === id);
    if (audit) {
      audit.summary = summary;
      audit.patchCount = patchCount;
      audit.status = "done";
      audit.completedAt = new Date().toISOString();
      writeJson(AUDITS_FILE, audits);
    }
  },

  fail(id: string, error: string): void {
    const audits = readJson<Audit[]>(AUDITS_FILE, []);
    const audit = audits.find((a) => a.id === id);
    if (audit) {
      audit.status = "error";
      audit.error = error;
      audit.completedAt = new Date().toISOString();
      writeJson(AUDITS_FILE, audits);
    }
  },

  list(): Audit[] {
    return readJson<Audit[]>(AUDITS_FILE, []);
  },

  get(id: string): Audit | null {
    const audits = readJson<Audit[]>(AUDITS_FILE, []);
    return audits.find((a) => a.id === id) ?? null;
  },
};

export const patchStore = {
  create(
    auditId: string,
    title: string,
    description: string,
    filePath: string,
    originalContent: string,
    proposedContent: string
  ): Patch {
    const patches = readJson<Patch[]>(PATCHES_FILE, []);
    const patch: Patch = {
      id: uuidv4(),
      auditId,
      title,
      description,
      filePath,
      originalContent,
      proposedContent,
      diffLines: computeDiff(originalContent, proposedContent),
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    patches.unshift(patch);
    writeJson(PATCHES_FILE, patches);
    return patch;
  },

  list(auditId?: string): Patch[] {
    const patches = readJson<Patch[]>(PATCHES_FILE, []);
    return auditId ? patches.filter((p) => p.auditId === auditId) : patches;
  },

  get(id: string): Patch | null {
    const patches = readJson<Patch[]>(PATCHES_FILE, []);
    return patches.find((p) => p.id === id) ?? null;
  },

  resolve(id: string, status: "approved" | "rejected"): Patch | null {
    const patches = readJson<Patch[]>(PATCHES_FILE, []);
    const patch = patches.find((p) => p.id === id);
    if (!patch) return null;
    patch.status = status;
    patch.resolvedAt = new Date().toISOString();
    writeJson(PATCHES_FILE, patches);
    return patch;
  },
};
