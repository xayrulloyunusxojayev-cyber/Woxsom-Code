import { Message, MessageRole } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { User, TerminalSquare, BrainCircuit, Code2, Database, ShieldAlert, Cpu } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  const roleConfig: Record<MessageRole, { icon: React.ElementType, color: string, border: string, bg: string, label: string }> = {
    user: { icon: User, color: "text-foreground", border: "border-border", bg: "bg-secondary/30", label: "You" },
    assistant: { icon: Cpu, color: "text-primary", border: "border-primary/50", bg: "bg-primary/5", label: "Assistant" },
    system: { icon: TerminalSquare, color: "text-muted-foreground", border: "border-muted-foreground/50", bg: "bg-muted/10", label: "System" },
    planner: { icon: BrainCircuit, color: "text-purple-400", border: "border-purple-500/50", bg: "bg-purple-500/5", label: "Planner" },
    executor_frontend: { icon: Code2, color: "text-blue-400", border: "border-blue-500/50", bg: "bg-blue-500/5", label: "Frontend Exec" },
    executor_backend: { icon: Database, color: "text-teal-400", border: "border-teal-500/50", bg: "bg-teal-500/5", label: "Backend Exec" },
    critic: { icon: ShieldAlert, color: "text-orange-400", border: "border-orange-500/50", bg: "bg-orange-500/5", label: "Critic" },
  };

  const config = roleConfig[message.role] || roleConfig.system;
  const Icon = config.icon;

  return (
    <div className={cn(
      "flex gap-4 p-4 rounded-lg border-l-4 transition-all animate-in slide-in-from-bottom-2 fade-in duration-300",
      config.bg,
      "border-y border-r border-y-transparent border-r-transparent hover:border-border/30",
      `border-l-${config.color.split('-')[1]}-500` // approximate tailwind color
    )} style={{ borderLeftColor: `var(--${config.color.split('-')[1]})` }}> {/* Tailwind v4 inline approach workaround */}
      
      <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 border bg-background", config.border)}>
        <Icon className={cn("w-4 h-4", config.color)} />
      </div>

      <div className="flex-1 space-y-1.5 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold uppercase tracking-wider", config.color)}>
            {message.agentName || config.label}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        
        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-mono prose prose-invert max-w-none">
          {message.content}
        </div>
      </div>
    </div>
  );
}