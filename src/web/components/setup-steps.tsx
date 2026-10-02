import { Check, Copy, Palette } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { copyText, type Health } from "@/lib/api";
import { cn } from "@/lib/utils";

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:4517";

const shellQuote = (s: string) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

/** One message that makes the agent install the MCP server and the skill itself. */
export function setupPrompt(setup?: Health["setup"]) {
  const cmd = (setup?.mcpCommand ?? ["npx", "-y", "framejam", "--stdio"]).map(shellQuote).join(" ");
  const skill = setup?.skillPath ?? "skills/framejam/SKILL.md from the framejam package";
  return [
    "Set up Frame Jam for me. It's a local MCP server for picking video styles and reviewing Hyperframes videos.",
    "",
    `1. Add an MCP server named "framejam" (stdio) that runs: ${cmd}`,
    `   Cursor: add it to ~/.cursor/mcp.json. Claude Code: claude mcp add framejam -- ${cmd}. Anything else: your usual MCP config.`,
    `2. Install the Frame Jam skill: copy ${shellQuote(skill)} to ~/.cursor/skills/framejam/SKILL.md (Cursor) or ~/.claude/skills/framejam/SKILL.md (Claude Code).`,
    `3. Tell me if I need to reload MCP servers. Then call list_presets to check it works, and open ${origin} in your built-in browser.`,
  ].join("\n");
}

export const STYLE_PROMPT = "Open Frame Jam in your built-in browser so I can pick a style";
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

/** A message for the agent chat, with one obvious Copy button. */
export function PromptBlock({ text, primary }: { text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fc-prompt">
      <p>{text}</p>
      <button
        type="button"
        className={cn("fc-btn sm", primary && "primary")}
        onClick={async () => {
          try {
            await copyText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        {copied ? <Check className="fc-i xs" /> : <Copy className="fc-i xs" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Setup as three messages to paste into the agent chat. Steps tick off as the server sees a connection, a style and a review. */
export function SetupSteps({
  health,
  agentName,
  styleName,
  hasReview,
}: {
  health?: Health | null;
  agentName?: string;
  styleName?: string;
  hasReview: boolean;
}) {
  const done = [Boolean(agentName), Boolean(styleName), hasReview];
  const current = done.indexOf(false);
  const state = (i: number) => (done[i] ? "done" : i === current ? "current" : "");
  return (
    <ol className="fc-steps">
      <li className={cn("fc-step", state(0))}>
        <span className="n">{done[0] ? <Check className="fc-i xs" /> : 1}</span>
        <div>
          <div className="st">Connect your agent</div>
          <p className="sd">
            {done[0]
              ? `Connected to ${agentName}. To set up another agent app, paste this there too:`
              : "Paste this into your agent chat (Cursor, Claude Code, Codex…). Your agent installs Frame Jam and its skill."}
          </p>
          <PromptBlock text={setupPrompt(health?.setup)} primary={current === 0} />
        </div>
      </li>
      <li className={cn("fc-step", state(1))}>
        <span className="n">{done[1] ? <Check className="fc-i xs" /> : 2}</span>
        <div>
          <div className="st">Pick a style</div>
          <p className="sd">{done[1] ? `Using ${styleName}. Change it any time.` : "Paste this, then press Use on the look you like."}</p>
          {!done[1] && <PromptBlock text={STYLE_PROMPT} primary={current === 1} />}
          <Link to="/styles" className="fc-btn ghost sm" style={{ marginTop: 6, marginLeft: -10 }}>
            <Palette className="fc-i sm" /> Or browse styles here
          </Link>
        </div>
      </li>
      <li className={cn("fc-step", state(2))}>
        <span className="n">{done[2] ? <Check className="fc-i xs" /> : 3}</span>
        <div>
          <div className="st">Ask for a video</div>
          <p className="sd">Paste this. Your agent builds it and opens the review right here.</p>
          <PromptBlock text={FIRST_VIDEO_PROMPT} primary={current === 2} />
        </div>
      </li>
    </ol>
  );
}
