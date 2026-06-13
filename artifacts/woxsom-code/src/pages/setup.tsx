import { useGetApiKeyStatus, useSetApiKeys } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Terminal, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const { data: status, isLoading: isChecking } = useGetApiKeyStatus();
  const setApiKeys = useSetApiKeys();
  const { toast } = useToast();

  const [keys, setKeys] = useState<string[]>([""]);

  useEffect(() => {
    // Redirect if keys are configured — either from env vars or stored file
    if (status?.configured) {
      setLocation("/chat");
    }
  }, [status, setLocation]);

  if (isChecking || status?.configured) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background dark">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
      toast({ title: "Error", description: "Please enter at least one API key", variant: "destructive" });
      return;
    }

    setApiKeys.mutate(
      { data: { keys: validKeys } },
      {
        onSuccess: () => {
          toast({ title: "Keys Configured", description: "API keys saved. Launching agents…" });
          setLocation("/chat");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save API keys", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background dark relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md glass-panel border-border/50 shadow-2xl relative z-10">
        <CardHeader className="space-y-1 pb-6 border-b border-border/10">
          <div className="flex items-center gap-2 mb-2 text-primary">
            <Terminal className="w-6 h-6" />
            <span className="font-bold text-xl tracking-tight">Woxsom Code</span>
          </div>
          <CardTitle className="text-2xl">Mission Control</CardTitle>
          <CardDescription className="text-muted-foreground">
            Initialize your terminal by providing Groq API keys. Add up to 5 keys for parallel multi-agent execution.
            Get free keys at{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              console.groq.com
            </a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form id="setup-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              {keys.map((key, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder={`gsk_key_${index + 1}…`}
                      className="pl-9 bg-background/50 font-mono text-sm focus-visible:ring-primary/50 transition-shadow"
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
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {keys.length < 5 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddKey}
                className="w-full border-dashed text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Another Key
              </Button>
            )}
          </form>
        </CardContent>
        <CardFooter className="pt-2 pb-6">
          <Button
            type="submit"
            form="setup-form"
            className="w-full glow-primary font-semibold transition-all hover:scale-[1.02]"
            disabled={setApiKeys.isPending}
          >
            {setApiKeys.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Initialize Agents"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
