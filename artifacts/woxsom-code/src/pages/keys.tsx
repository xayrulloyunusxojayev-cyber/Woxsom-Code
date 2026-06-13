import { AppLayout } from "@/components/layout";
import { useGetApiKeyStatus, useSetApiKeys } from "@workspace/api-client-react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Key,
  Plus,
  Trash2,
  Loader2,
  Save,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function KeysPage() {
  const { data: status, isLoading, refetch } = useGetApiKeyStatus();
  const setApiKeys = useSetApiKeys();
  const { toast } = useToast();

  const [keys, setKeys] = useState<string[]>([""]);
  const [showExisting, setShowExisting] = useState(false);

  const isConfigured = status?.configured ?? false;

  const handleAddKey = () => {
    if (keys.length < 5) setKeys([...keys, ""]);
  };

  const handleRemoveKey = (index: number) => {
    setKeys(keys.filter((_, i) => i !== index));
  };

  const handleKeyChange = (index: number, value: string) => {
    const updated = [...keys];
    updated[index] = value;
    setKeys(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validKeys = keys.filter((k) => k.trim().length > 0);
    if (validKeys.length === 0) {
      toast({ title: "No keys entered", description: "Please enter at least one API key.", variant: "destructive" });
      return;
    }
    setApiKeys.mutate(
      { data: { keys: validKeys } },
      {
        onSuccess: () => {
          toast({ title: "Keys Saved", description: `${validKeys.length} key(s) saved to database.` });
          setKeys([""]);
          void refetch();
        },
        onError: (err) => {
          const msg = (err as { message?: string })?.message ?? "Failed to save API keys";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto w-full h-full overflow-y-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">API Keys</h1>
          <p className="text-muted-foreground">
            Add your Groq API keys to power the agent pipeline. Get free keys at{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              console.groq.com/keys
            </a>.
          </p>
        </div>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  Groq API Keys
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Add up to 5 keys for parallel multi-agent execution. Keys rotate round-robin to bypass rate limits.
                </CardDescription>
              </div>
              {!isLoading && (
                <Badge
                  variant={isConfigured ? "default" : "destructive"}
                  className={`shrink-0 gap-1.5 ${isConfigured ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/20" : ""}`}
                >
                  {isConfigured ? (
                    <><ShieldCheck className="w-3 h-3" /> {status?.keyCount} key{(status?.keyCount ?? 0) !== 1 ? "s" : ""} active</>
                  ) : (
                    <><AlertTriangle className="w-3 h-3" /> No keys</>
                  )}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Checking key status…</span>
              </div>
            ) : (
              <div className="space-y-5">
                {!isConfigured && (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                    <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">No API keys configured</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        The agent pipeline cannot run without at least one Groq API key.
                      </p>
                    </div>
                  </div>
                )}

                {isConfigured && status?.maskedKeys && status.maskedKeys.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Active keys (masked)
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowExisting(!showExisting)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showExisting ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showExisting ? "Hide" : "Show"}
                      </button>
                    </div>
                    {showExisting && (
                      <div className="space-y-1.5">
                        {status.maskedKeys.map((mk, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-md border border-border/30 bg-background/30 px-3 py-2">
                            <Key className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                            <code className="text-xs text-muted-foreground font-mono">{mk}</code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    {isConfigured ? "Replace keys" : "Add keys"}
                  </p>
                  <form id="keys-form" onSubmit={handleSubmit} className="space-y-3">
                    {keys.map((key, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder={`gsk_key_${index + 1}…`}
                            className="pl-9 bg-background/50 font-mono text-sm focus-visible:ring-primary/50"
                            value={key}
                            onChange={(e) => handleKeyChange(index, e.target.value)}
                            autoComplete="off"
                          />
                        </div>
                        {keys.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveKey(index)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {keys.length < 5 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddKey}
                        className="w-full border-dashed text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-4 h-4 mr-2" /> Add Another Key ({keys.length}/5)
                      </Button>
                    )}
                  </form>
                  <p className="text-xs text-muted-foreground">
                    Saving new keys replaces any previously stored keys.
                  </p>
                </div>
              </div>
            )}
          </CardContent>

          {!isLoading && (
            <CardFooter className="border-t border-border/10 pt-6">
              <Button
                type="submit"
                form="keys-form"
                className="gap-2"
                disabled={setApiKeys.isPending}
              >
                {setApiKeys.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Keys
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
