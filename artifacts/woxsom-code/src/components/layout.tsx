import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useListSessions, useCreateSession, getListSessionsQueryKey, useDeleteSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, MessageSquare, Settings, Plus, Terminal, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { data: sessions, isLoading } = useListSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const queryClient = useQueryClient();

  const handleNewSession = () => {
    createSession.mutate({ data: { title: "New Project" } }, {
      onSuccess: (session) => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setLocation(`/chat/${session.id}`);
      }
    });
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteSession.mutate({ sessionId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        if (location === `/chat/${id}`) {
          setLocation("/chat");
        }
      }
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-4 h-14 border-b border-sidebar-border">
          <Terminal className="w-5 h-5 text-primary" />
          <span className="font-bold text-lg tracking-tight">Woxsom Code</span>
        </div>

        <div className="p-3">
          <Button 
            className="w-full justify-start gap-2 shadow-sm border border-primary/20 hover:border-primary/50 transition-all group"
            onClick={handleNewSession}
            disabled={createSession.isPending}
          >
            <Plus className="w-4 h-4 group-hover:text-primary transition-colors" />
            New Project
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 py-2">
            <h3 className="px-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">Sessions</h3>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-md mb-1 bg-sidebar-accent/50" />
              ))
            ) : sessions?.length === 0 ? (
              <p className="text-xs text-sidebar-foreground/50 px-2">No projects yet</p>
            ) : (
              sessions?.map((session) => (
                <Link key={session.id} href={`/chat/${session.id}`} className="block group">
                  <div className={`px-2 py-1.5 text-sm rounded-md truncate cursor-pointer transition-colors relative pr-8 ${location === `/chat/${session.id}` ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
                    {session.title || "Untitled Project"}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-opacity"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // handle delete (mutation hook not imported here though, let's just make it call a prop or do it inline)
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />
        
        <div className="p-3 space-y-1">
          <Link href="/chat" className="block">
            <div className={`flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer transition-colors ${location === '/chat' || location.startsWith('/chat/') ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
              <MessageSquare className="w-4 h-4" />
              Chat
            </div>
          </Link>
          <Link href="/models" className="block">
            <div className={`flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer transition-colors ${location === '/models' ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
              <LayoutDashboard className="w-4 h-4" />
              Models
            </div>
          </Link>
          <Link href="/settings" className="block">
            <div className={`flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer transition-colors ${location === '/settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
              <Settings className="w-4 h-4" />
              Settings
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}