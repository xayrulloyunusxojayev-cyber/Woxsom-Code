import { AgentStatus, PipelineStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Loader2, XCircle, KeyRound } from "lucide-react";
import { Link } from "wouter";

interface PipelinePanelProps {
  status: PipelineStatus | null;
}

export function PipelinePanel({ status }: PipelinePanelProps) {
  if (!status || status.status === 'idle') return null;

  const isNeedsKeys = status.status === 'needs_keys';

  const groups = [
    { id: 'A', name: 'Planning', agents: status.agents.filter(a => a.group === 'A') },
    { id: 'B', name: 'Execution', agents: status.agents.filter(a => a.group === 'B') },
    { id: 'C', name: 'Review', agents: status.agents.filter(a => a.group === 'C') }
  ];

  return (
    <Card className="glass-panel border-primary/20 shadow-lg rounded-t-xl rounded-b-none border-b-0 p-4 absolute bottom-full left-0 right-0 z-10 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.status === 'error' ? 'bg-destructive' : isNeedsKeys ? 'bg-amber-500' : status.status === 'done' ? 'bg-green-500' : 'bg-primary animate-pulse'}`} />
            <h4 className="text-sm font-semibold tracking-wide uppercase text-foreground/90">Agent Pipeline</h4>
          </div>
          {isNeedsKeys ? (
            <Link href="/settings" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors">
              <KeyRound className="w-3 h-3" /> Update API Keys →
            </Link>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">{status.currentStep || 'Initializing...'}</span>
          )}
        </div>

        <Progress value={status.progress || 0} className="h-1 bg-secondary" indicatorClassName={`${status.status === 'error' ? 'bg-destructive' : isNeedsKeys ? 'bg-amber-500' : status.status === 'done' ? 'bg-green-500' : 'bg-primary'}`} />

        <div className="grid grid-cols-3 gap-4 mt-2">
          {groups.map(group => (
            <div key={group.id} className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{group.name}</div>
              <div className="space-y-1.5">
                {group.agents.map(agent => (
                  <AgentItem key={agent.name} agent={agent} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AgentItem({ agent }: { agent: AgentStatus }) {
  const isError = agent.status === 'error';
  const isDone = agent.status === 'done';
  const isActive = agent.status === 'active';

  return (
    <div className={`flex flex-col gap-1 p-2 rounded-md border text-xs transition-colors ${
      isActive ? 'border-primary/40 bg-primary/5 glow-border-primary' : 
      isError ? 'border-destructive/40 bg-destructive/5' : 
      isDone ? 'border-green-500/20 bg-green-500/5' : 
      'border-border/50 bg-background/50'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono font-medium truncate ${isActive ? 'text-primary' : isError ? 'text-destructive' : isDone ? 'text-green-500' : 'text-muted-foreground'}`}>
          {agent.name}
        </span>
        {isActive ? <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" /> :
         isError ? <XCircle className="w-3 h-3 text-destructive shrink-0" /> :
         isDone ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" /> :
         <Circle className="w-3 h-3 text-muted-foreground/30 shrink-0" />}
      </div>
      {agent.model && (
        <span className="text-[9px] text-muted-foreground/70 truncate opacity-80">{agent.model}</span>
      )}
      {isActive && agent.task && (
        <span className="text-[10px] text-foreground/80 leading-tight mt-0.5 line-clamp-2 animate-in fade-in duration-300">
          {agent.task}
        </span>
      )}
    </div>
  );
}