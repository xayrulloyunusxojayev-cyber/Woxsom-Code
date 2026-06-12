import { AppLayout } from "@/components/layout";
import { useListModels, ModelInfo } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Zap, Wrench, Loader2 } from "lucide-react";

export default function ModelsPage() {
  const { data: models, isLoading } = useListModels();

  const groupConfig = {
    reasoning: { icon: Brain, color: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-500/5", label: "Reasoning Models" },
    fast: { icon: Zap, color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/5", label: "Fast Execution Models" },
    specialized: { icon: Wrench, color: "text-teal-400", border: "border-teal-500/30", bg: "bg-teal-500/5", label: "Specialized Models" }
  };

  const groupedModels = models?.reduce((acc, model) => {
    if (!acc[model.group]) acc[model.group] = [];
    acc[model.group].push(model);
    return acc;
  }, {} as Record<string, ModelInfo[]>) || {};

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto w-full h-full overflow-y-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Model Intelligence</h1>
          <p className="text-muted-foreground">The neural architecture powering Woxsom Code's agent pipeline.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-12">
            {(Object.entries(groupConfig) as [keyof typeof groupConfig, typeof groupConfig[keyof typeof groupConfig]][]).map(([groupKey, config]) => {
              const groupModels = groupedModels[groupKey] || [];
              if (groupModels.length === 0) return null;
              
              const Icon = config.icon;

              return (
                <div key={groupKey} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <Icon className={`w-5 h-5 ${config.color}`} />
                    <h2 className="text-xl font-semibold">{config.label}</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupModels.map(model => (
                      <Card key={model.id} className={`glass-panel border ${config.border} hover:border-primary/50 transition-colors`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base font-mono font-bold tracking-tight break-all">{model.name}</CardTitle>
                            {model.recommended && (
                              <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 shrink-0">Recommended</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{model.capability}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}