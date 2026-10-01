import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:4517";

const SNIPPETS = [
  {
    id: "cursor",
    label: "Cursor",
    hint: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in your project):",
    code: `{
  "mcpServers": {
    "framecut": {
      "command": "npx",
      "args": ["-y", "framecut", "--stdio"]
    }
  }
}`,
  },
  {
    id: "claude",
    label: "Claude Code",
    hint: "Run once in your terminal:",
    code: `claude mcp add framecut -- npx -y framecut --stdio`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT desktop",
    hint: "Settings → Connectors → Advanced → Developer mode → Create. Use the streamable HTTP URL (expose it with a tunnel if the app requires https):",
    code: `${origin}/mcp`,
  },
];

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Clipboard is not available in this browser");
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function ConnectCard() {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="font-medium">Connect your agent</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Framecut speaks MCP. Once connected, ask your agent to build a Hyperframes video and call{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">open_review</code> — the review appears here.
      </p>
      <Tabs defaultValue="cursor" className="mt-4">
        <TabsList>
          {SNIPPETS.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SNIPPETS.map((s) => (
          <TabsContent key={s.id} value={s.id} className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">{s.hint}</p>
            <div className="relative rounded-lg border bg-background">
              <div className="absolute top-1.5 right-1.5">
                <CopyButton text={s.code} />
              </div>
              <pre className="overflow-x-auto p-3 pr-20 font-mono text-xs leading-relaxed">{s.code}</pre>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
