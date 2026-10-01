import { Check, Copy, Palette } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { copyText } from "@/lib/api";
import { cn } from "@/lib/utils";

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:4517";

const CONNECT = [
  {
    id: "claude",
    label: "Claude Code",
    code: "claude mcp add framejam -- npx -y framejam --stdio",
    hint: "Run once in your terminal, then restart Claude Code.",
  },
  {
    id: "cursor",
    label: "Cursor",
    code: `{\n  "mcpServers": {\n    "framejam": { "command": "npx", "args": ["-y", "framejam", "--stdio"] }\n  }\n}`,
    hint: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in your project).",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    code: `${origin}/mcp`,
    hint: "In ChatGPT settings, turn on developer mode for connectors and add a custom connector with this URL.",
  },
];

export const FIRST_VIDEO_PROMPT = "Make a 10s launch teaser with Frame Jam and open it for review";

export function CodeBlock({ code, block }: { code: string; block?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("fc-code", block && "block")}>
      <code>{code}</code>
      <button
        type="button"
        className="fc-btn ghost icon sm round"
        aria-label="Copy"
        onClick={async () => {
          try {
            await copyText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        {copied ? <Check className="fc-i sm" /> : <Copy className="fc-i sm" />}
      </button>
    </div>
  );
}

export function ConnectInstructions() {
  const [tab, setTab] = useState(CONNECT[0].id);
  const current = CONNECT.find((c) => c.id === tab)!;
  return (
    <div className="fc-col" style={{ gap: 10 }}>
      <div className="fc-seg sm" role="group" aria-label="Your agent app">
        {CONNECT.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === tab} onClick={() => setTab(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <CodeBlock code={current.code} block={current.code.includes("\n")} />
      <p className="fc-caption" style={{ margin: 0 }}>
        {current.hint}
      </p>
    </div>
  );
}

/** First-run checklist. Steps tick themselves off as the server sees a connection, a style and a review. */
export function SetupSteps({ agentName, styleName, hasReview }: { agentName?: string; styleName?: string; hasReview: boolean }) {
  const done = [Boolean(agentName), Boolean(styleName), hasReview];
  const current = done.indexOf(false);
  const state = (i: number) => (done[i] ? "done" : i === current ? "current" : "");
  return (
    <ol className="fc-steps">
      <li className={cn("fc-step", state(0))}>
        <span className="n">{done[0] ? <Check className="fc-i xs" /> : 1}</span>
        <div>
          <div className="st">Connect your agent</div>
          {done[0] ? (
            <p className="sd">Connected to {agentName}.</p>
          ) : (
            <>
              <p className="sd">Frame Jam talks to your agent over MCP. Pick your app and run this once:</p>
              <ConnectInstructions />
            </>
          )}
        </div>
      </li>
      <li className={cn("fc-step", state(1))}>
        <span className="n">{done[1] ? <Check className="fc-i xs" /> : 2}</span>
        <div>
          <div className="st">Pick a style</div>
          <p className="sd">
            {done[1] ? `Using ${styleName}.` : "Choose how your video should look. Your agent gets the colours, fonts and motion."}
          </p>
          {!done[1] && (
            <Link to="/styles" className={cn("fc-btn", current === 1 ? "primary" : "", "sm")}>
              <Palette className="fc-i sm" /> Browse styles
            </Link>
          )}
        </div>
      </li>
      <li className={cn("fc-step", state(2))}>
        <span className="n">{done[2] ? <Check className="fc-i xs" /> : 3}</span>
        <div>
          <div className="st">Ask for a video</div>
          <p className="sd">Paste this into your agent chat:</p>
          <CodeBlock code={FIRST_VIDEO_PROMPT} />
        </div>
      </li>
    </ol>
  );
}
