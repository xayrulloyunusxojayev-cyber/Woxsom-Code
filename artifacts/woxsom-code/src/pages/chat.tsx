import { AppLayout } from "@/components/layout";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetSession,
  useSendMessage,
  useGetPipelineStatus,
  useListSessions,
  useCreateSession,
  getGetSessionQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageBubble } from "@/components/message-bubble";
import { PipelinePanel } from "@/components/pipeline-panel";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  TerminalSquare,
  Loader2,
  Github,
  ExternalLink,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function checkGitHubToken(sessionId: string): Promise<boolean> {
  const r = await fetch(`${API_BASE}/api/github/token-status?sessionId=${sessionId}`);
  if (!r.ok) return false;
  const data = (await r.json()) as { connected: boolean };
  return data.connected;
}

async function syncToGitHub(
  sessionId: string,
  repoName: string
): Promise<{ url?: string; error?: string; code?: string }> {
  const r = await fetch(`${API_BASE}/api/github/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, repoName }),
  });
  const data = (await r.json()) as { url?: string; error?: string; code?: string };
  if (!r.ok) return { error: data.error ?? "Sync failed", code: (data as { error?: string }).error };
  return data;
}

export default function ChatPage() {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const sessionId = params.id;
  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  const createSession = useCreateSession();

  // ── GitHub sync state ──────────────────────────────────────────────────────
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);

  // Detect return from GitHub OAuth callback (?github_ready=1&sessionId=...)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const ready = search.get("github_ready");
    const errorMsg = search.get("github_error");
    const returnedSessionId = search.get("sessionId");

    if ((ready || errorMsg) && returnedSessionId) {
      // Strip the query params from the URL
      window.history.replaceState({}, "", window.location.pathname);

      if (ready === "1") {
        setGithubConnected(true);
        setGithubDialogOpen(true);
        toast({ title: "GitHub Connected", description: "You can now push your project to GitHub." });
      } else if (errorMsg) {
        toast({
          title: "GitHub Auth Failed",
          description: decodeURIComponent(errorMsg),
          variant: "destructive",
        });
      }
    }
  }, [location, toast]);

  // Auto-create session if none exist on empty /chat route
  useEffect(() => {
    if (!sessionId && !sessionsLoading && sessions) {
      if (sessions.length > 0) {
        setLocation(`/chat/${sessions[0].id}`);
      } else if (!createSession.isPending) {
        createSession.mutate(
          { data: { title: "New Project" } },
          {
            onSuccess: (session) => {
              queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
              setLocation(`/chat/${session.id}`);
            },
          }
        );
      }
    }
  }, [sessionId, sessions, sessionsLoading, setLocation, createSession, queryClient]);

  const { data: session } = useGetSession(sessionId || "", {
    query: {
      enabled: !!sessionId,
      queryKey: getGetSessionQueryKey(sessionId || ""),
    },
  });

  const { data: pipelineStatus } = useGetPipelineStatus(sessionId || "", {
    query: {
      enabled: !!sessionId && !!session && ["planning", "executing", "reviewing"].includes(session.status),
      queryKey: [`pipeline-status`, sessionId],
      refetchInterval: (query) => {
        const s = (query.state.data as { status?: string } | undefined)?.status;
        return s && ["planning", "executing", "reviewing"].includes(s) ? 1500 : false;
      },
    },
  });

  const sendMessage = useSendMessage();
  const [prompt, setPrompt] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !sessionId) return;
    const content = prompt;
    setPrompt("");
    sendMessage.mutate(
      { sessionId, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
        },
      }
    );
  };

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages]);

  // ── GitHub sync handlers ───────────────────────────────────────────────────
  const handleOpenGitHubDialog = useCallback(async () => {
    if (!sessionId) return;
    setRepoUrl(null);
    setRepoName("");

    setCheckingToken(true);
    const connected = await checkGitHubToken(sessionId);
    setCheckingToken(false);
    setGithubConnected(connected);

    if (!connected) {
      // Redirect to GitHub OAuth — callback will return here with ?github_ready=1
      window.location.href = `${API_BASE}/api/github/auth?sessionId=${sessionId}`;
      return;
    }

    setGithubDialogOpen(true);
  }, [sessionId]);

  const handleSync = useCallback(async () => {
    if (!sessionId || !repoName.trim()) return;

    const cleanName = repoName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
    if (!cleanName) {
      toast({ title: "Invalid repo name", description: "Use letters, numbers, hyphens, or dots.", variant: "destructive" });
      return;
    }

    setSyncing(true);
    try {
      const result = await syncToGitHub(sessionId, cleanName);
      if (result.url) {
        setRepoUrl(result.url);
        toast({ title: "Pushed to GitHub!", description: `Repository created: ${cleanName}` });
      } else if (result.code === "no_token") {
        setGithubConnected(false);
        setGithubDialogOpen(false);
        toast({
          title: "Session expired",
          description: "GitHub connection expired. Reconnecting…",
          variant: "destructive",
        });
        window.location.href = `${API_BASE}/api/github/auth?sessionId=${sessionId}`;
      } else {
        toast({ title: "Sync Failed", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    } finally {
      setSyncing(false);
    }
  }, [sessionId, repoName, toast]);

  const handleReconnect = useCallback(() => {
    if (!sessionId) return;
    setGithubDialogOpen(false);
    window.location.href = `${API_BASE}/api/github/auth?sessionId=${sessionId}`;
  }, [sessionId]);

  if (!sessionId) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p>Initializing terminal...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background relative">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/95 backdrop-blur shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
              <TerminalSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-sm truncate max-w-[300px]">
                {session?.title || "Loading..."}
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{session?.status || "idle"}</span>
                {["planning", "executing", "reviewing"].includes(session?.status || "") && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                )}
              </div>
            </div>
          </div>

          {session?.hasProject && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenGitHubDialog}
              disabled={checkingToken}
              className="gap-2 bg-background border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              {checkingToken ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Github className="w-4 h-4" />
              )}
              Sync to GitHub
            </Button>
          )}
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          <ScrollArea className="flex-1 p-6" viewportRef={scrollRef}>
            <div className="max-w-4xl mx-auto space-y-6 pb-32">
              {session?.messages?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                    <TerminalSquare className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Awaiting Instructions</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Describe the application you want to build. The agent pipeline will decompose your
                    request and build it piece by piece.
                  </p>
                </div>
              ) : (
                session?.messages?.map((msg) => <MessageBubble key={msg.id} message={msg} />)
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-12">
            <div className="max-w-4xl mx-auto relative">
              <PipelinePanel status={pipelineStatus || null} />

              <form onSubmit={handleSend} className="relative z-20 flex gap-2">
                <div className="relative flex-1 group">
                  <div className="absolute inset-0 bg-primary/5 rounded-xl blur-xl group-hover:bg-primary/10 transition-colors pointer-events-none" />
                  <Input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Initialize new objective..."
                    className="w-full h-14 pl-4 pr-12 rounded-xl border-primary/20 bg-background/80 backdrop-blur-md focus-visible:ring-primary/50 text-base font-mono shadow-lg"
                    disabled={
                      sendMessage.isPending ||
                      ["planning", "executing", "reviewing"].includes(session?.status || "")
                    }
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="absolute right-2 top-2 h-10 w-10 rounded-lg glow-primary"
                    disabled={
                      !prompt.trim() ||
                      sendMessage.isPending ||
                      ["planning", "executing", "reviewing"].includes(session?.status || "")
                    }
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* ── GitHub Sync Dialog ────────────────────────────────────────────────── */}
      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              Push to GitHub
            </DialogTitle>
            <DialogDescription>
              {repoUrl
                ? "Your project has been pushed to GitHub."
                : "Enter a repository name. A new public repository will be created in your GitHub account and your generated project files will be pushed in a single initial commit."}
            </DialogDescription>
          </DialogHeader>

          {repoUrl ? (
            /* ── Success state ── */
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <Github className="w-5 h-5 text-green-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-400">Repository created!</p>
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate block"
                  >
                    {repoUrl}
                  </a>
                </div>
              </div>
              <Button asChild className="w-full gap-2">
                <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  Open Repository
                </a>
              </Button>
            </div>
          ) : (
            /* ── Input state ── */
            <div className="space-y-4 py-2">
              {!githubConnected && (
                <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-400">
                    GitHub connection lost. Click "Reconnect" to re-authenticate.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="repo-name" className="text-sm font-medium">
                  Repository name
                </label>
                <Input
                  id="repo-name"
                  placeholder="my-woxsom-project"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && repoName.trim() && !syncing && githubConnected) {
                      void handleSync();
                    }
                  }}
                  disabled={syncing || !githubConnected}
                  className="font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Letters, numbers, hyphens, and dots only. Spaces will be converted to hyphens.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {repoUrl ? (
              <Button variant="outline" onClick={() => setGithubDialogOpen(false)}>
                Close
              </Button>
            ) : !githubConnected ? (
              <Button onClick={handleReconnect} className="gap-2 w-full">
                <Github className="w-4 h-4" />
                Reconnect GitHub
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setGithubDialogOpen(false)} disabled={syncing}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSync()}
                  disabled={!repoName.trim() || syncing}
                  className="gap-2"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Push to GitHub
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
