import { AppLayout } from "@/components/layout";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetSession, 
  useSendMessage, 
  useGetPipelineStatus, 
  useListSessions, 
  useCreateSession,
  getGetSessionQueryKey,
  getListSessionsQueryKey,
  SessionDetail
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/message-bubble";
import { PipelinePanel } from "@/components/pipeline-panel";
import { Send, Download, TerminalSquare, Loader2 } from "lucide-react";

export default function ChatPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const sessionId = params.id;
  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  const createSession = useCreateSession();
  
  // Auto-create session if none exist on empty /chat route
  useEffect(() => {
    if (!sessionId && !sessionsLoading && sessions) {
      if (sessions.length > 0) {
        setLocation(`/chat/${sessions[0].id}`);
      } else if (!createSession.isPending) {
        createSession.mutate({ data: { title: "New Project" } }, {
          onSuccess: (session) => {
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            setLocation(`/chat/${session.id}`);
          }
        });
      }
    }
  }, [sessionId, sessions, sessionsLoading, setLocation, createSession, queryClient]);

  const { data: session } = useGetSession(sessionId || "", { 
    query: { 
      enabled: !!sessionId,
      queryKey: getGetSessionQueryKey(sessionId || ""),
    } 
  });

  const { data: pipelineStatus } = useGetPipelineStatus(sessionId || "", {
    query: {
      enabled: !!sessionId && !!session && ['planning', 'executing', 'reviewing'].includes(session.status),
      queryKey: [`pipeline-status`, sessionId],
      refetchInterval: (query) => {
        const s = (query.state.data as { status?: string } | undefined)?.status;
        return (s && ['planning', 'executing', 'reviewing'].includes(s)) ? 1500 : false;
      }
    }
  });

  const sendMessage = useSendMessage();
  const [prompt, setPrompt] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !sessionId) return;

    const content = prompt;
    setPrompt("");

    // Optimistically update UI if needed, but react-query will handle it
    sendMessage.mutate({ sessionId, data: { content } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      }
    });
  };

  const handleDownload = () => {
    if (sessionId && session?.hasProject) {
      window.open(`/api/sessions/${sessionId}/download`, '_blank');
    }
  };

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages]);

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
              <h1 className="font-semibold text-sm truncate max-w-[300px]">{session?.title || 'Loading...'}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{session?.status || 'idle'}</span>
                {['planning', 'executing', 'reviewing'].includes(session?.status || '') && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {session?.hasProject && (
            <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2 bg-background">
              <Download className="w-4 h-4" />
              Download Project
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
                    Describe the application you want to build. The agent pipeline will decompose your request and build it piece by piece.
                  </p>
                </div>
              ) : (
                session?.messages?.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
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
                    disabled={sendMessage.isPending || ['planning', 'executing', 'reviewing'].includes(session?.status || '')}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="absolute right-2 top-2 h-10 w-10 rounded-lg glow-primary"
                    disabled={!prompt.trim() || sendMessage.isPending || ['planning', 'executing', 'reviewing'].includes(session?.status || '')}
                  >
                    {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}