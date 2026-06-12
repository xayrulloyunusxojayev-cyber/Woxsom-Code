import { AppLayout } from "@/components/layout";
import { useGetApiKeyStatus, useSetApiKeys } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Plus, Trash2, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { data: status, isLoading } = useGetApiKeyStatus();
  const setApiKeys = useSetApiKeys();
  const { toast } = useToast();
  
  const [keys, setKeys] = useState<string[]>([""]);

  useEffect(() => {
    if (status?.configured && status.maskedKeys) {
      setKeys(status.maskedKeys.length > 0 ? status.maskedKeys : [""]);
    }
  }, [status]);

  const handleAddKey = () => {
    if (keys.length < 5) setKeys([...keys, ""]);
  };

  const handleRemoveKey = (index: number) => {
    setKeys(keys.filter((_, i) => i !== index));
  };

  const handleKeyChange = (index: number, value: string) => {
    const newKeys = [...keys];
    newKeys[index] = value;
    setKeys(newKeys);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validKeys = keys.filter(k => k.trim().length > 0 && !k.includes("...")); // ignore masked keys on submit if they haven't changed
    
    // If they only have masked keys and hit save, do nothing or send as is? 
    // API expects full keys. If they submit masked keys, backend might fail or ignore.
    // For this UI, if they change a key, they replace the masked string.
    const keysToSubmit = keys.filter(k => k.trim() !== "");
    
    setApiKeys.mutate({ data: { keys: keysToSubmit } }, {
      onSuccess: () => {
        toast({ title: "Settings Saved", description: "API keys updated successfully." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save API keys", variant: "destructive" });
      }
    });
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto w-full h-full overflow-y-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">System Configuration</h1>
          <p className="text-muted-foreground">Manage core terminal settings and API access.</p>
        </div>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Groq API Keys
            </CardTitle>
            <CardDescription>
              Provide up to 5 keys to enable parallel agent execution. The pipeline uses these to bypass rate limits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <form id="settings-form" onSubmit={handleSubmit} className="space-y-4 max-w-xl">
                {keys.map((key, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={`Enter key...`}
                        className="pl-9 bg-background/50 font-mono text-sm focus-visible:ring-primary/50"
                        value={key}
                        onChange={(e) => handleKeyChange(index, e.target.value)}
                      />
                    </div>
                    {keys.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveKey(index)} className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {keys.length < 5 && (
                  <Button type="button" variant="outline" size="sm" onClick={handleAddKey} className="w-full border-dashed text-muted-foreground hover:text-foreground">
                    <Plus className="w-4 h-4 mr-2" /> Add Key Slot
                  </Button>
                )}
              </form>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/10 pt-6">
            <Button type="submit" form="settings-form" className="gap-2" disabled={setApiKeys.isPending}>
              {setApiKeys.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppLayout>
  );
}