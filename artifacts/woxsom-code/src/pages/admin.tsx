import { AppLayout } from "@/components/layout";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Cpu,
  FileText,
  FolderTree,
  ScrollText,
  Map,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  AlertTriangle,
  Play,
  ThumbsUp,
  ThumbsDown,
  Terminal,
  Server,
  Activity,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "filetree" | "roadmap" | "logs" | "audit";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface DiffLine {
  type: "keep" | "add" | "remove";
  line: string;
  lineNo: number;
}

interface Patch {
  id: string;
  auditId: string;
  title: string;
  description: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diffLines: DiffLine[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
}

interface Audit {
  id: string;
  summary: string;
  filesScanned: string[];
  patchCount: number;
  status: "running" | "done" | "error";
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: Record<string, unknown>;
}

interface SystemInfo {
  uptime: number;
  nodeVersion: string;
  memoryMB: { rss: number; heapUsed: number; heapTotal: number };
  systemRoots: Record<string, string>;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({ error: r.statusText }))) as { error: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

function FileTreeNode({ node, onSelect, selectedPath }: {
  node: FileNode;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  const [open, setOpen] = useState(true);

  if (node.type === "file") {
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors font-mono ${selectedPath === node.path ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
      >
        <FileText className="w-3 h-3 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-sidebar-foreground/70 hover:text-foreground rounded hover:bg-accent transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {open && node.children && (
        <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5 mt-0.5">
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} onSelect={onSelect} selectedPath={selectedPath} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiffViewer({ lines }: { lines: DiffLine[] }) {
  const visible = lines.filter((l) => l.type !== "keep").length > 0
    ? lines
    : lines;

  return (
    <div className="font-mono text-xs leading-5 overflow-x-auto">
      {visible.map((line, i) => (
        <div
          key={i}
          className={`flex gap-2 px-3 py-0 whitespace-pre ${
            line.type === "add"
              ? "bg-green-950/40 text-green-400 border-l-2 border-green-500"
              : line.type === "remove"
              ? "bg-red-950/40 text-red-400 border-l-2 border-red-500"
              : "text-muted-foreground/60"
          }`}
        >
          <span className="w-4 shrink-0 select-none">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          <span>{line.line}</span>
        </div>
      ))}
    </div>
  );
}

function PatchCard({ patch, onApprove, onReject }: {
  patch: Patch;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  const statusIcon = {
    pending: <Clock className="w-4 h-4 text-yellow-400" />,
    approved: <CheckCircle2 className="w-4 h-4 text-green-400" />,
    rejected: <XCircle className="w-4 h-4 text-red-400" />,
  }[patch.status];

  const statusBadge = {
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    approved: "bg-green-500/10 text-green-400 border-green-500/30",
    rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  }[patch.status];

  const changedLines = patch.diffLines.filter((l) => l.type !== "keep").length;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{patch.title}</h3>
            <Badge variant="outline" className={`text-xs ${statusBadge}`}>
              {patch.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">{patch.filePath}</p>
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{patch.description.replace(/\*\*/g, "")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{changedLines} lines changed</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="text-xs h-7 px-2"
          >
            {expanded ? "Hide diff" : "View diff"}
          </Button>
          {patch.status === "pending" && (
            <>
              <Button
                size="sm"
                className="h-7 px-3 gap-1 bg-green-700 hover:bg-green-600 text-white"
                onClick={() => setApproveOpen(true)}
              >
                <ThumbsUp className="w-3 h-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-3 gap-1"
                onClick={() => onReject(patch.id)}
              >
                <ThumbsDown className="w-3 h-3" />
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="bg-muted/20 px-4 py-2 text-xs text-muted-foreground font-mono flex items-center gap-2">
            <span className="text-green-400">+{patch.diffLines.filter((l) => l.type === "add").length}</span>
            <span className="text-red-400">-{patch.diffLines.filter((l) => l.type === "remove").length}</span>
            <span className="ml-auto">{patch.filePath}</span>
          </div>
          <ScrollArea className="max-h-96">
            <DiffViewer lines={patch.diffLines} />
          </ScrollArea>
        </div>
      )}

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Apply patch to system source?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite <span className="font-mono text-foreground">{patch.filePath}</span> on disk.
              The change takes effect after the API server restarts. This action cannot be automatically undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-700 hover:bg-green-600 text-white"
              onClick={() => { setApproveOpen(false); onApprove(patch.id); }}
            >
              Approve &amp; Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("filetree");
  const [fileTrees, setFileTrees] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [roadmap, setRoadmap] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<string | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditScope, setAuditScope] = useState<"core" | "all">("core");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadFileTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ trees: FileNode[] }>("/admin/file-tree");
      setFileTrees(data.trees);
      const info = await apiFetch<SystemInfo>("/admin/system-info");
      setSystemInfo(info);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoadmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ content: string }>("/admin/roadmap");
      setRoadmap(data.content);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ logs: LogEntry[] }>("/admin/logs?limit=200");
      setLogs(data.logs.slice().reverse());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auditData, patchData] = await Promise.all([
        apiFetch<{ audits: Audit[] }>("/admin/audits"),
        apiFetch<{ patches: Patch[] }>("/admin/patches"),
      ]);
      setAudits(auditData.audits);
      setPatches(patchData.patches);
      if (auditData.audits.some((a) => a.status === "running")) {
        setTimeout(() => void loadAuditData(), 2000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "filetree") void loadFileTree();
    if (tab === "roadmap") void loadRoadmap();
    if (tab === "logs") void loadLogs();
    if (tab === "audit") void loadAuditData();
  }, [tab, loadFileTree, loadRoadmap, loadLogs, loadAuditData]);

  const handleSelectFile = async (filePath: string) => {
    setSelectedFile(filePath);
    setFileLoading(true);
    try {
      const data = await apiFetch<{ content: string }>(`/admin/file?path=${encodeURIComponent(filePath)}`);
      setFileContent(data.content);
    } catch (e) {
      setFileContent(`Error: ${(e as Error).message}`);
    } finally {
      setFileLoading(false);
    }
  };

  const handleRunAudit = async () => {
    setAuditRunning(true);
    setError(null);
    try {
      const data = await apiFetch<{ auditId: string; fileCount: number }>("/admin/audit", {
        method: "POST",
        body: JSON.stringify({ scope: auditScope }),
      });
      showToast(`Audit started — scanning ${data.fileCount} files`);
      setSelectedAudit(data.auditId);
      setTimeout(() => void loadAuditData(), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAuditRunning(false);
    }
  };

  const handleApprove = async (patchId: string) => {
    try {
      await apiFetch(`/admin/patches/${patchId}/approve`, { method: "POST" });
      showToast("Patch applied to disk. Restart the API server to activate.");
      await loadAuditData();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleReject = async (patchId: string) => {
    try {
      await apiFetch(`/admin/patches/${patchId}/reject`, { method: "POST" });
      showToast("Patch rejected.");
      await loadAuditData();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const visiblePatches = selectedAudit
    ? patches.filter((p) => p.auditId === selectedAudit)
    : patches;

  const pendingCount = patches.filter((p) => p.status === "pending").length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "filetree", label: "File Tree", icon: <FolderTree className="w-4 h-4" /> },
    { id: "roadmap", label: "Roadmap", icon: <Map className="w-4 h-4" /> },
    { id: "logs", label: "System Logs", icon: <ScrollText className="w-4 h-4" /> },
    { id: "audit", label: `Audit${pendingCount > 0 ? ` (${pendingCount})` : ""}`, icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center gap-3 px-6 bg-background/95 backdrop-blur shrink-0">
          <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Engine Control Room</h1>
            <p className="text-xs text-muted-foreground">System source · Self-improvement · Human-in-the-loop</p>
          </div>

          {systemInfo && (
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-green-400" />
                <span>Up {Math.round(systemInfo.uptime / 60)}m</span>
              </div>
              <div className="flex items-center gap-1">
                <Server className="w-3 h-3" />
                <span>{systemInfo.memoryMB.heapUsed}MB / {systemInfo.memoryMB.heapTotal}MB heap</span>
              </div>
              <div className="flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                <span>{systemInfo.nodeVersion}</span>
              </div>
            </div>
          )}
        </header>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 border-b border-border bg-background shrink-0 pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-md border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Toast */}
        {toast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg shadow-lg">
            {toast}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-100">✕</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* ── FILE TREE ─────────────────────────────────────────────── */}
          {tab === "filetree" && (
            <div className="flex h-full">
              <div className="w-72 border-r border-border flex flex-col shrink-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Source</span>
                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => void loadFileTree()}>
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
                <ScrollArea className="flex-1 p-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {fileTrees.map((tree) => (
                        <FileTreeNode
                          key={tree.path}
                          node={tree}
                          onSelect={(p) => void handleSelectFile(p)}
                          selectedPath={selectedFile}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedFile ? (
                  <>
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">{selectedFile}</span>
                      {fileLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                    </div>
                    <ScrollArea className="flex-1">
                      <pre className="p-4 text-xs font-mono text-foreground/80 leading-5 whitespace-pre-wrap break-all">
                        {fileContent}
                      </pre>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <FolderTree className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Select a file to view its contents</p>
                    <p className="text-xs opacity-60">Only system source files are accessible here</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ROADMAP ───────────────────────────────────────────────── */}
          {tab === "roadmap" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ROADMAP.md — Self-Improvement Plan</span>
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => void loadRoadmap()}>
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
              <ScrollArea className="flex-1 p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <RoadmapRenderer content={roadmap} />
                )}
              </ScrollArea>
            </div>
          )}

          {/* ── LOGS ──────────────────────────────────────────────────── */}
          {tab === "logs" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Event Log</span>
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => void loadLogs()}>
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
              <ScrollArea className="flex-1 p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground text-sm">No log entries yet. Run an audit to generate system events.</div>
                ) : (
                  <div className="space-y-1 font-mono">
                    {logs.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 text-xs py-1.5 px-3 rounded hover:bg-accent/30 transition-colors">
                        <span className="text-muted-foreground/50 w-28 shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`w-10 shrink-0 font-semibold ${
                          entry.level === "error" ? "text-red-400"
                          : entry.level === "warn" ? "text-yellow-400"
                          : entry.level === "debug" ? "text-blue-400"
                          : "text-green-400"
                        }`}>
                          {entry.level.toUpperCase()}
                        </span>
                        <span className="text-foreground/80 flex-1">{entry.message}</span>
                        {entry.data && (
                          <span className="text-muted-foreground/50 truncate max-w-xs hidden lg:block">
                            {JSON.stringify(entry.data)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* ── AUDIT ─────────────────────────────────────────────────── */}
          {tab === "audit" && (
            <div className="flex h-full">
              {/* Left: audit list + controls */}
              <div className="w-80 border-r border-border flex flex-col shrink-0">
                <div className="p-4 border-b border-border space-y-3">
                  <p className="text-xs text-muted-foreground">
                    The AI scans Woxsom Code's own source, identifies bugs and improvements, and generates diffs for your approval.
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setAuditScope("core")}
                      className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${auditScope === "core" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                    >
                      Core files
                    </button>
                    <button
                      onClick={() => setAuditScope("all")}
                      className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${auditScope === "all" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                    >
                      All source
                    </button>
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={() => void handleRunAudit()}
                    disabled={auditRunning || audits.some((a) => a.status === "running")}
                  >
                    {auditRunning || audits.some((a) => a.status === "running") ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Auditing…</>
                    ) : (
                      <><Play className="w-4 h-4" /> Run Audit</>
                    )}
                  </Button>
                </div>

                <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                  Past Audits
                </div>
                <ScrollArea className="flex-1">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : audits.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8 px-4">No audits yet. Run your first audit above.</p>
                  ) : (
                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => setSelectedAudit(null)}
                        className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${!selectedAudit ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}
                      >
                        All patches ({patches.length})
                      </button>
                      {audits.map((audit) => (
                        <button
                          key={audit.id}
                          onClick={() => setSelectedAudit(audit.id)}
                          className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${selectedAudit === audit.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}
                        >
                          <div className="flex items-center gap-2">
                            {audit.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {audit.status === "done" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                            {audit.status === "error" && <XCircle className="w-3 h-3 text-red-400" />}
                            <span className="truncate">{new Date(audit.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="text-muted-foreground/60 mt-0.5 flex items-center gap-2">
                            <span>{audit.patchCount} patches</span>
                            <span>·</span>
                            <span>{audit.filesScanned.length} files</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Right: patches */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedAudit
                      ? `Patches — ${audits.find((a) => a.id === selectedAudit)?.patchCount ?? 0} generated`
                      : `All Patches (${patches.length})`}
                  </span>
                  {pendingCount > 0 && (
                    <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                      {pendingCount} pending review
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" className="ml-auto gap-1 h-7 text-xs" onClick={() => void loadAuditData()}>
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>

                {selectedAudit && (() => {
                  const audit = audits.find((a) => a.id === selectedAudit);
                  return audit?.summary ? (
                    <div className="mx-6 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-semibold text-primary mb-1">AI Audit Summary</p>
                      <p className="text-xs text-muted-foreground">{audit.summary}</p>
                    </div>
                  ) : null;
                })()}

                <ScrollArea className="flex-1 p-6">
                  {visiblePatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                      <Zap className="w-10 h-10 opacity-20" />
                      <p className="text-sm">
                        {audits.some((a) => a.status === "running")
                          ? "Audit in progress — patches will appear here…"
                          : "No patches yet. Run an audit to generate improvement proposals."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visiblePatches.map((patch) => (
                        <PatchCard
                          key={patch.id}
                          patch={patch}
                          onApprove={(id) => void handleApprove(id)}
                          onReject={(id) => void handleReject(id)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function RoadmapRenderer({ content }: { content: string }) {
  if (!content) return <p className="text-muted-foreground text-sm">No roadmap content found.</p>;

  const lines = content.split("\n");

  return (
    <div className="max-w-3xl mx-auto space-y-1 pb-8">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return <h1 key={i} className="text-2xl font-bold mt-2 mb-3">{line.slice(2)}</h1>;
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-semibold mt-6 mb-2 text-primary">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-sm font-semibold mt-3 mb-1 text-muted-foreground uppercase tracking-wide">{line.slice(4)}</h3>;
        }
        if (/^- \[x\]/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[x\] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        if (/^- \[~\]/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-2 text-sm text-yellow-400">
              <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />
              <span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[~\] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        if (/^- \[!\]/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-2 text-sm text-red-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[!\] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        if (/^- \[ \]/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground/70">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[ \] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        if (line.startsWith("- ")) {
          return <p key={i} className="text-sm text-muted-foreground ml-4">• {line.slice(2)}</p>;
        }
        if (line.startsWith("---")) {
          return <Separator key={i} className="my-4" />;
        }
        if (line.startsWith("|")) {
          return (
            <div key={i} className="font-mono text-xs text-muted-foreground/70 overflow-x-auto">
              {line}
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-2" />;
        }
        return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
      })}
    </div>
  );
}
