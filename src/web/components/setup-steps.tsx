import { Check, Copy, Palette } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DOCS_URL } from "@/components/header";
import { copyText, type Health } from "@/lib/api";
import { cn } from "@/lib/utils";

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:2400";

const shellQuote = (s: string) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

type Harness = "cursor" | "claude" | "codex";
const HARNESSES: { id: Harness; label: string }[] = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];

/**
 * One sentence per agent app that makes the agent install the MCP server and the skill itself. Worded like
 * the install prompts on framejam.ai; the command and skill folder are this copy's, when it isn't from npm.
 */
export function setupPrompt(harness: Harness, setup?: Health["setup"]) {
  const cmd = setup?.mcpCommand ?? ["npx", "-y", "framejam", "--stdio"];
  const fromNpm = cmd[0] === "npx";
  const skillFolder = !fromNpm && setup?.skillPath ? `the ${shellQuote(setup.skillPath.replace(/[\\/]SKILL\.md$/, ""))} folder` : "the skills/framejam folder from the framejam npm package";
  const cmdLine = cmd.map(shellQuote).join(" ");
  const add =
    harness === "cursor"
      ? `add it as an MCP server named "framejam" in ~/.cursor/mcp.json (command "${cmd[0]}", args ${JSON.stringify(cmd.slice(1))})`
      : `run \`${harness} mcp add framejam -- ${cmdLine}\``;
  const skillsDir = harness === "cursor" ? "~/.cursor" : harness === "claude" ? "~/.claude" : "~/.codex";
  return `Install FrameJam for me: ${add}, copy ${skillFolder} to ${skillsDir}/skills/framejam, then open ${origin} in the browser.`;
}

/** Which tab to show first: the agent that already connected, if we know it. */
function harnessFor(agentName?: string): Harness {
  const name = agentName?.toLowerCase() ?? "";
  if (name.includes("claude")) return "claude";
  if (name.includes("codex")) return "codex";
  return "cursor";
}

export const STYLE_PROMPT = "Open FrameJam in your built-in browser so I can pick a style";
export const FIRST_VIDEO_PROMPT = "Make a 7-second launch teaser with FrameJam and open it for review.";

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
  const [harness, setHarness] = useState<Harness>(() => harnessFor(agentName));
  const label = HARNESSES.find((h) => h.id === harness)!.label;
  return (
    <ol className="fc-steps">
      <li className={cn("fc-step", state(0))}>
        <span className="n">{done[0] ? <Check className="fc-i xs" /> : 1}</span>
        <div>
          <div className="st">Connect your agent</div>
          <div className="fc-seg sm" role="group" aria-label="Choose your agent" style={{ margin: "4px 0 10px" }}>
            {HARNESSES.map((h) => (
              <button key={h.id} type="button" aria-pressed={harness === h.id} onClick={() => setHarness(h.id)}>
                {h.label}
              </button>
            ))}
          </div>
          <p className="sd">
            {!done[0]
              ? `Paste this into ${label}. Your agent installs FrameJam.`
              : harness === harnessFor(agentName)
                ? `Connected to ${agentName}.`
                : `Connected to ${agentName}. To add ${label} too, paste this there:`}
          </p>
          <PromptBlock text={setupPrompt(harness, health?.setup)} primary={current === 0} />
          <p className="sd fc-t3" style={{ margin: "8px 0 0" }}>
            Needs Node 22+ and ffmpeg.{" "}
            <a href={`${DOCS_URL}/docs/install#manual`} target="_blank" rel="noreferrer">
              Manual setup
            </a>
          </p>
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
