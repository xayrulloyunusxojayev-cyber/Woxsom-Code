import { AppLayout } from "@/components/layout";
import { useState, useEffect, useCallback, useRef } from "react";
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
  Cpu, FileText, FolderTree, ScrollText, Map, RefreshCw,
  ChevronRight, ChevronDown, Loader2, CheckCircle2, XCircle,
  Clock, Zap, AlertTriangle, Play, ThumbsUp, ThumbsDown,
  Terminal, Server, Activity, TerminalSquare, Send, Info,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "filetree" | "roadmap" | "logs" | "audit" | "command";

// ─── Data types ───────────────────────────────────────────────────────────────
interface FileNode { name: string; path: string; type: "file" | "directory"; children?: FileNode[] }
interface DiffLine  { type: "keep" | "add" | "remove"; line: string; lineNo: number }
interface Patch {
  id: string; auditId: string; title: string; description: string;
  filePath: string; originalContent: string; proposedContent: string;
  diffLines: DiffLine[]; status: "pending" | "approved" | "rejected";
  createdAt: string; resolvedAt: string | null;
}
interface Audit {
  id: string; summary: string; filesScanned: string[]; patchCount: number;
  status: "running" | "done" | "error"; createdAt: string;
  completedAt: string | null; error: string | null;
}
interface LogEntry {
  id: number; timestamp: string; level: "info" | "warn" | "error" | "debug";
  message: string; data?: Record<string, unknown>;
}
interface SystemInfo {
  uptime: number; nodeVersion: string;
  memoryMB: { rss: number; heapUsed: number; heapTotal: number };
  systemRoots: Record<string, string>;
}
interface CommandResult { commandId: string; sessionId: string; status: "running" | "done" | "error"; patchCount?: number; summary?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch<T>(urlPath: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}/api${urlPath}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({ error: r.statusText }))) as { error: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FileTreeNode({ node, onSelect, selectedPath }: {
  node: FileNode; onSelect: (p: string) => void; selectedPath: string | null;
}) {
  const [open, setOpen] = useState(true);
  if (node.type === "file") {
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors font-mono truncate ${
          selectedPath === node.path
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
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
  return (
    <div className="font-mono text-xs leading-5 overflow-x-auto select-text">
      {lines.map((line, i) => (
        <div
          key={i}
          className={`flex gap-2 px-3 py-0 whitespace-pre ${
            line.type === "add"    ? "bg-green-950/40 text-green-400 border-l-2 border-green-500"
          : line.type === "remove" ? "bg-red-950/40 text-red-400 border-l-2 border-red-500"
          : "text-muted-foreground/50"
          }`}
        >
          <span className="w-4 shrink-0 select-none user-select-none">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          <span>{line.line}</span>
        </div>
      ))}
    </div>
  );
}

function PatchCard({ patch, onApprove, onReject }: {
  patch: Patch; onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  const addedLines   = patch.diffLines.filter((l) => l.type === "add").length;
  const removedLines = patch.diffLines.filter((l) => l.type === "remove").length;

  const statusIcon = {
    pending:  <Clock className="w-4 h-4 text-yellow-400" />,
    approved: <CheckCircle2 className="w-4 h-4 text-green-400" />,
    rejected: <XCircle className="w-4 h-4 text-red-400" />,
  }[patch.status];

  const statusCls = {
    pending:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    approved: "bg-green-500/10 text-green-400 border-green-500/30",
    rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  }[patch.status];

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{patch.title}</h3>
            <Badge variant="outline" className={`text-xs ${statusCls}`}>{patch.status}</Badge>
          </div>
          <p className="text-xs text-primary/70 font-mono mt-1">{patch.filePath}</p>
          {patch.description && patch.description !== patch.title && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
              {patch.description.replace(/\*\*/g, "")}
            </p>
          )}
          <p className="text-xs text-muted-foreground/50 mt-1 font-mono">
            <span className="text-green-400">+{addedLines}</span>
            {" / "}
            <span className="text-red-400">-{removedLines}</span>
            {" lines"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)} className="text-xs h-7 px-2">
            {expanded ? "Hide diff" : "View diff"}
          </Button>
          {patch.status === "pending" && (
            <>
              <Button size="sm" className="h-7 px-3 gap-1 bg-green-700 hover:bg-green-600 text-white" onClick={() => setApproveOpen(true)}>
                <ThumbsUp className="w-3 h-3" /> Approve
              </Button>
              <Button size="sm" variant="destructive" className="h-7 px-3 gap-1" onClick={() => onReject(patch.id)}>
                <ThumbsDown className="w-3 h-3" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="bg-muted/20 px-4 py-2 text-xs text-muted-foreground font-mono flex items-center gap-3">
            <span className="text-green-400">+{addedLines}</span>
            <span className="text-red-400">-{removedLines}</span>
            <span className="ml-auto truncate">{patch.filePath}</span>
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
              <AlertTriangle className="w-5 h-5 text-yellow-400" /> Apply patch to system source?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites <span className="font-mono text-foreground">{patch.filePath}</span> on disk.
              The change activates after the API server restarts. This cannot be automatically undone.
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

// ─── Roadmap renderer ─────────────────────────────────────────────────────────
function RoadmapRenderer({ content }: { content: string }) {
  if (!content) return <p className="text-muted-foreground text-sm">No roadmap content found.</p>;
  return (
    <div className="max-w-3xl mx-auto space-y-1 pb-8">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("# "))   return <h1 key={i} className="text-2xl font-bold mt-2 mb-3">{line.slice(2)}</h1>;
        if (line.startsWith("## "))  return <h2 key={i} className="text-lg font-semibold mt-6 mb-2 text-primary">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-semibold mt-3 mb-1 text-muted-foreground uppercase tracking-wide">{line.slice(4)}</h3>;
        if (/^> /.test(line)) return <blockquote key={i} className="border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground italic my-1">{line.slice(2)}</blockquote>;
        if (/^- \[x\]/.test(line)) return <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[x\] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} /></div>;
        if (/^- \[~\]/.test(line)) return <div key={i} className="flex items-start gap-2 text-sm text-yellow-400"><Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" /><span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[~\] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} /></div>;
        if (/^- \[!\]/.test(line)) return <div key={i} className="flex items-start gap-2 text-sm text-red-400"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[!\] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} /></div>;
        if (/^- \[ \]/.test(line)) return <div key={i} className="flex items-start gap-2 text-sm text-foreground/70"><Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: line.replace(/^- \[ \] /, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} /></div>;
        if (/^- \[-\]/.test(line)) return <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground/40 line-through"><Clock className="w-4 h-4 mt-0.5 shrink-0" /><span>{line.replace(/^- \[-\] /, "")}</span></div>;
        if (line.startsWith("- "))  return <p key={i} className="text-sm text-muted-foreground ml-4">• {line.slice(2)}</p>;
        if (line.startsWith("---")) return <Separator key={i} className="my-4" />;
        if (line.startsWith("|"))   return <div key={i} className="font-mono text-xs text-muted-foreground/70 overflow-x-auto">{line}</div>;
        if (line.trim() === "")     return <div key={i} className="h-2" />;
        return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("filetree");

  // File tree
  const [fileTrees, setFileTrees]   = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent]   = useState<string>("");
  const [fileLoading, setFileLoading]   = useState(false);

  // Roadmap
  const [roadmap, setRoadmap] = useState("");

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Audit
  const [audits, setAudits]         = useState<Audit[]>([]);
  const [patches, setPatches]       = useState<Patch[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<string | null>(null);
  const [auditRunning, setAuditRunning]   = useState(false);
  const [auditScope, setAuditScope]       = useState<"core" | "all">("core");

  // Command console
  const [cmdPrompt, setCmdPrompt]         = useState("");
  const [cmdRunning, setCmdRunning]       = useState(false);
  const [cmdResult, setCmdResult]         = useState<CommandResult | null>(null);
  const [cmdError, setCmdError]           = useState<string | null>(null);
  const cmdPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Shared
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [toastMsg, setToastMsg]     = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // ── Data loaders ────────────────────────────────────────────────────────────
  const loadFileTree = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [treeData, info] = await Promise.all([
        apiFetch<{ trees: FileNode[] }>("/admin/file-tree"),
        apiFetch<SystemInfo>("/admin/system-info"),
      ]);
      setFileTrees(treeData.trees);
      setSystemInfo(info);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const loadRoadmap = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiFetch<{ content: string }>("/admin/roadmap");
      setRoadmap(d.content);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ logs: LogEntry[] }>("/admin/logs?limit=200");
      setLogs([...d.logs].reverse());
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const loadAuditData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ad, pd] = await Promise.all([
        apiFetch<{ audits: Audit[] }>("/admin/audits"),
        apiFetch<{ patches: Patch[] }>("/admin/patches"),
      ]);
      setAudits(ad.audits);
      setPatches(pd.patches);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  // Poll audits while any is "running"
  useEffect(() => {
    const hasRunning = audits.some((a) => a.status === "running");
    if (!hasRunning) return;
    const t = setTimeout(() => void loadAuditData(), 2000);
    return () => clearTimeout(t);
  }, [audits, loadAuditData]);

  useEffect(() => {
    if (tab === "filetree") void loadFileTree();
    if (tab === "roadmap")  void loadRoadmap();
    if (tab === "logs")     void loadLogs();
    if (tab === "audit")    void loadAuditData();
    if (tab === "command")  { void loadAuditData(); void loadLogs(); }
  }, [tab, loadFileTree, loadRoadmap, loadLogs, loadAuditData]);

  // ── File viewer ─────────────────────────────────────────────────────────────
  const handleSelectFile = async (filePath: string) => {
    setSelectedFile(filePath); setFileLoading(true);
    try {
      const d = await apiFetch<{ content: string }>(`/admin/file?path=${encodeURIComponent(filePath)}`);
      setFileContent(d.content);
    } catch (e) {
      setFileContent(`Error loading file: ${(e as Error).message}`);
    } finally { setFileLoading(false); }
  };

  // ── Audit ───────────────────────────────────────────────────────────────────
  const handleRunAudit = async () => {
    setAuditRunning(true); setError(null);
    try {
      const d = await apiFetch<{ auditId: string; fileCount: number }>("/admin/audit", {
        method: "POST", body: JSON.stringify({ scope: auditScope }),
      });
      showToast(`Audit started — scanning ${d.fileCount} files`);
      setSelectedAudit(d.auditId);
      await loadAuditData();
    } catch (e) { setError((e as Error).message); }
    finally { setAuditRunning(false); }
  };

  const handleApprove = async (patchId: string) => {
    try {
      await apiFetch(`/admin/patches/${patchId}/approve`, { method: "POST" });
      showToast("Patch applied to disk. Restart the API server to activate.");
      await loadAuditData();
    } catch (e) { setError((e as Error).message); }
  };

  const handleReject = async (patchId: string) => {
    try {
      await apiFetch(`/admin/patches/${patchId}/reject`, { method: "POST" });
      showToast("Patch rejected.");
      await loadAuditData();
    } catch (e) { setError((e as Error).message); }
  };

  // ── Command Console ─────────────────────────────────────────────────────────
  const stopCmdPoll = () => {
    if (cmdPollRef.current) { clearInterval(cmdPollRef.current); cmdPollRef.current = null; }
  };

  const pollCommandStatus = (auditId: string) => {
    stopCmdPoll();
    cmdPollRef.current = setInterval(async () => {
      try {
        const d = await apiFetch<{ audits: Audit[] }>("/admin/audits");
        const audit = d.audits.find((a) => a.id === auditId);
        if (!audit) return;
        if (audit.status !== "running") {
          stopCmdPoll();
          setAudits(d.audits);
          const pd = await apiFetch<{ patches: Patch[] }>("/admin/patches");
          setPatches(pd.patches);
          setCmdResult((prev) => prev ? {
            ...prev,
            status: audit.status,
            patchCount: audit.patchCount,
            summary: audit.summary,
          } : null);
        }
      } catch { /* ignore poll errors */ }
    }, 2000);
  };

  const handleExecuteCommand = async () => {
    if (!cmdPrompt.trim() || cmdRunning) return;
    setCmdRunning(true);
    setCmdError(null);
    setCmdResult(null);

    try {
      const d = await apiFetch<{ commandId: string; sessionId: string; status: string }>(
        "/admin/command",
        { method: "POST", body: JSON.stringify({ prompt: cmdPrompt.trim() }) }
      );
      setCmdResult({ commandId: d.commandId, sessionId: d.sessionId, status: "running" });
      pollCommandStatus(d.commandId);
    } catch (e) {
      const msg = (e as Error).message;
      setCmdError(msg);
      setCmdRunning(false);
      // Still log to system logs via a best-effort fetch
      void apiFetch("/admin/logs").then(() => void loadLogs()).catch(() => undefined);
    } finally {
      setCmdRunning(false);
    }
  };

  useEffect(() => () => stopCmdPoll(), []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [cmdPrompt]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const pendingCount    = patches.filter((p) => p.status === "pending").length;
  const visiblePatches  = selectedAudit ? patches.filter((p) => p.auditId === selectedAudit) : patches;
  const cmdResultAudit  = cmdResult ? audits.find((a) => a.id === cmdResult.commandId) : null;
  const cmdPatches      = cmdResult ? patches.filter((p) => p.auditId === cmdResult.commandId) : [];

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "filetree", label: "File Tree",       icon: <FolderTree className="w-4 h-4" /> },
    { id: "roadmap",  label: "Roadmap",          icon: <Map className="w-4 h-4" /> },
    { id: "logs",     label: "System Logs",      icon: <ScrollText className="w-4 h-4" /> },
    { id: "audit",    label: "Audit",            icon: <Zap className="w-4 h-4" />, badge: pendingCount },
    { id: "command",  label: "Command Console",  icon: <TerminalSquare className="w-4 h-4" /> },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
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
              <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-green-400" /> Up {Math.round(systemInfo.uptime / 60)}m</span>
              <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {systemInfo.memoryMB.heapUsed}MB heap</span>
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> {systemInfo.nodeVersion}</span>
            </div>
          )}
        </header>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 border-b border-border bg-background shrink-0 pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-3 py-2 text-sm rounded-t-md border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="ml-0.5 text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-1.5 py-0 leading-4">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Toast */}
        {toastMsg && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2">
            {toastMsg}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">✕</button>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">

          {/* FILE TREE */}
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
                    <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-0.5">
                      {fileTrees.map((tree) => (
                        <FileTreeNode key={tree.path} node={tree} onSelect={(p) => void handleSelectFile(p)} selectedPath={selectedFile} />
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
                      <pre className="p-4 text-xs font-mono text-foreground/80 leading-5 whitespace-pre-wrap break-all select-text">{fileContent}</pre>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <FolderTree className="w-10 h-10 opacity-20" />
                    <p className="text-sm">Select a file to view its source</p>
                    <p className="text-xs opacity-50">Only system boundary files are accessible</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ROADMAP */}
          {tab === "roadmap" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ROADMAP.md — Self-Improvement Plan</span>
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => void loadRoadmap()}>
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
              <ScrollArea className="flex-1 p-6">
                {loading
                  ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  : <RoadmapRenderer content={roadmap} />}
              </ScrollArea>
            </div>
          )}

          {/* LOGS */}
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
                  <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground text-sm">No log entries yet. Run an audit or command to generate events.</div>
                ) : (
                  <div className="space-y-0.5 font-mono">
                    {logs.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 text-xs py-1.5 px-3 rounded hover:bg-accent/30">
                        <span className="text-muted-foreground/50 w-28 shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        <span className={`w-10 shrink-0 font-semibold ${
                          entry.level === "error" ? "text-red-400"
                          : entry.level === "warn" ? "text-yellow-400"
                          : entry.level === "debug" ? "text-blue-400"
                          : "text-green-400"
                        }`}>{entry.level.toUpperCase()}</span>
                        <span className="text-foreground/80 flex-1">{entry.message}</span>
                        {entry.data && (
                          <span className="text-muted-foreground/40 truncate max-w-xs hidden xl:block">
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

          {/* AUDIT */}
          {tab === "audit" && (
            <div className="flex h-full">
              {/* Left sidebar */}
              <div className="w-80 border-r border-border flex flex-col shrink-0">
                <div className="p-4 border-b border-border space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The AI scans Woxsom Code's own source, identifies concrete bugs and improvements, then generates diffs for your approval.
                  </p>
                  <div className="flex gap-2">
                    {(["core", "all"] as const).map((s) => (
                      <button key={s} onClick={() => setAuditScope(s)}
                        className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${auditScope === s ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                        {s === "core" ? "Core files" : "All source"}
                      </button>
                    ))}
                  </div>
                  <Button className="w-full gap-2" onClick={() => void handleRunAudit()}
                    disabled={auditRunning || audits.some((a) => a.status === "running")}>
                    {auditRunning || audits.some((a) => a.status === "running")
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Auditing…</>
                      : <><Play className="w-4 h-4" /> Run Audit</>}
                  </Button>
                </div>

                <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                  Past Audits
                </div>
                <ScrollArea className="flex-1">
                  {audits.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8 px-4">No audits yet. Run your first audit above.</p>
                  ) : (
                    <div className="p-2 space-y-1">
                      <button onClick={() => setSelectedAudit(null)}
                        className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${!selectedAudit ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}>
                        All patches ({patches.length})
                      </button>
                      {audits.map((audit) => (
                        <button key={audit.id} onClick={() => setSelectedAudit(audit.id)}
                          className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${selectedAudit === audit.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent"}`}>
                          <div className="flex items-center gap-2">
                            {audit.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {audit.status === "done"    && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                            {audit.status === "error"   && <XCircle className="w-3 h-3 text-red-400" />}
                            <span className="truncate">{new Date(audit.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="text-muted-foreground/50 mt-0.5 flex gap-2 text-xs">
                            <span>{audit.patchCount} patches</span>
                            <span>·</span>
                            <span>{audit.filesScanned.length} files</span>
                            {audit.filesScanned[0] === "command-console" && (
                              <Badge variant="outline" className="text-xs py-0 px-1 ml-auto border-primary/30 text-primary/70">cmd</Badge>
                            )}
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
                    {selectedAudit ? `Patches — audit ${new Date(audits.find(a=>a.id===selectedAudit)?.createdAt ?? "").toLocaleTimeString()}` : `All Patches (${patches.length})`}
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
                    <div className="mx-6 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 shrink-0">
                      <p className="text-xs font-semibold text-primary mb-1">AI Summary</p>
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
                        <PatchCard key={patch.id} patch={patch}
                          onApprove={(id) => void handleApprove(id)}
                          onReject={(id) => void handleReject(id)} />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}

          {/* COMMAND CONSOLE */}
          {tab === "command" && (
            <div className="flex flex-col h-full">
              {/* Input section */}
              <div className="border-b border-border bg-background shrink-0">
                <div className="max-w-3xl mx-auto p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <TerminalSquare className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-semibold text-sm">Command Console</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Describe a development task in plain language. The agent decomposes it into atomic file patches for your approval in the Audit tab.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card overflow-hidden focus-within:border-primary/40 transition-colors">
                    <textarea
                      ref={textareaRef}
                      value={cmdPrompt}
                      onChange={(e) => setCmdPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void handleExecuteCommand();
                        }
                      }}
                      placeholder={`Describe what you want to improve or add, e.g.:

"Add a retry count field to the PipelineState so the UI can show '2nd attempt' when Group B is retried by the Critic."

"Refactor the truncate() helper in agents.ts to accept a percentage of the model's context window instead of a fixed character count."`}
                      disabled={cmdRunning}
                      rows={5}
                      className="w-full resize-none bg-transparent text-sm font-mono p-4 placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50 min-h-[120px]"
                      style={{ maxHeight: 240 }}
                    />
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                        <Info className="w-3 h-3" />
                        <span>⌘↵ to execute</span>
                        <span className="mx-1">·</span>
                        <span>Patches require approval before being applied</span>
                      </div>
                      <Button
                        onClick={() => void handleExecuteCommand()}
                        disabled={!cmdPrompt.trim() || cmdRunning}
                        size="sm"
                        className="gap-2 h-8"
                      >
                        {cmdRunning
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Running…</>
                          : <><Send className="w-3 h-3" /> Execute</>}
                      </Button>
                    </div>
                  </div>

                  {/* Error */}
                  {cmdError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">Agent failed</p>
                        <p className="text-xs mt-0.5 opacity-80">{cmdError}</p>
                        <p className="text-xs mt-1 opacity-60">Error details saved to System Logs.</p>
                      </div>
                      <button onClick={() => setCmdError(null)} className="text-red-300 hover:text-red-100 shrink-0">✕</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Results section */}
              <ScrollArea className="flex-1">
                <div className="max-w-3xl mx-auto p-6">
                  {!cmdResult && !cmdError && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                      <TerminalSquare className="w-12 h-12 opacity-15" />
                      <p className="text-sm font-medium">Awaiting your command</p>
                      <p className="text-xs opacity-60 max-w-sm text-center">
                        The agent will read the system source, decompose your task into concrete code patches, and queue them for your review.
                      </p>
                    </div>
                  )}

                  {cmdResult && (
                    <div className="space-y-4">
                      {/* Status card */}
                      <div className={`rounded-xl border p-4 ${
                        cmdResult.status === "running" ? "border-primary/30 bg-primary/5"
                        : cmdResult.status === "done"  ? "border-green-500/30 bg-green-500/5"
                        : "border-red-500/30 bg-red-500/5"
                      }`}>
                        <div className="flex items-center gap-3">
                          {cmdResult.status === "running" && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                          {cmdResult.status === "done"    && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                          {cmdResult.status === "error"   && <XCircle className="w-5 h-5 text-red-400" />}
                          <div className="flex-1">
                            <p className="font-semibold text-sm">
                              {cmdResult.status === "running" ? "Agent decomposing task…"
                               : cmdResult.status === "done"
                                 ? `${cmdResult.patchCount ?? cmdResultAudit?.patchCount ?? 0} patch${(cmdResult.patchCount ?? 0) !== 1 ? "es" : ""} generated`
                                 : "Agent encountered an error"}
                            </p>
                            {cmdResultAudit?.summary && (
                              <p className="text-xs text-muted-foreground mt-1">{cmdResultAudit.summary}</p>
                            )}
                          </div>
                          {cmdResult.status !== "running" && (
                            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => { setSelectedAudit(cmdResult.commandId); setTab("audit"); }}>
                              <Zap className="w-3 h-3" /> View in Audit
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Inline patches preview */}
                      {cmdPatches.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Generated Patches — approve each before it's applied
                          </p>
                          {cmdPatches.map((patch) => (
                            <PatchCard key={patch.id} patch={patch}
                              onApprove={(id) => void handleApprove(id)}
                              onReject={(id) => void handleReject(id)} />
                          ))}
                        </div>
                      )}

                      {cmdResult.status === "done" && cmdPatches.length === 0 && (
                        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-start gap-3">
                          <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/50" />
                          <div>
                            <p className="font-medium text-foreground/70">No patches were generated</p>
                            <p className="text-xs mt-1">
                              The agent may not have found files matching the task within the system boundary, or the proposed changes were identical to the current source.
                              Try rephrasing your task with more specific file references.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
