import { Check, Copy, Palette } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DOCS_URL } from "@/components/header";
import { copyText, type Health } from "@/lib/api";
import { cn } from "@/lib/utils";

const shellQuote = (s: string) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

type Harness = "cursor" | "claude" | "codex";
const HARNESSES: { id: Harness; label: string; skillsAgent: string }[] = [
  { id: "cursor", label: "Cursor", skillsAgent: "cursor" },
  { id: "claude", label: "Claude Code", skillsAgent: "claude-code" },
  { id: "codex", label: "Codex", skillsAgent: "codex" },
];

/** What the agent tells the user when the framejam tools don't show up right after install. */
const RESTART_PROMPT: Record<Harness, string> = {
  cursor: "If the framejam tools don't show up, tell me to turn framejam on in Cursor Settings → MCP or reload the window.",
  claude: "When you're done, tell me to restart Claude Code so the framejam tools load.",
  codex: "When you're done, tell me to restart the MCP servers (Settings → MCP servers → Restart) so the framejam tools load.",
};

/** Shown under step 1 while the setup checklist waits for the first MCP connection. */
const RESTART_HINT: Record<Harness, string> = {
  cursor: "Nothing after your agent is done? Check that framejam is on in Cursor Settings → MCP, or reload the window.",
  claude: "Claude Code loads MCP servers when it starts. Once your agent is done, quit it and run claude again.",
  codex: "Codex loads MCP servers when it starts. Once your agent is done, go to Settings → MCP servers and press Restart.",
};

/**
 * The message per agent app that makes the agent install FrameJam itself: the MCP server, the skill (via the
 * `skills` CLI) and the background UI. Worded like the install prompts on framejam.ai; a source checkout swaps in
 * its own commands and skill folder.
 */
export function setupPrompt(harness: Harness, setup?: Health["setup"]) {
  const cmd = setup?.mcpCommand ?? ["npx", "-y", "framejam", "--stdio"];
  const startCmd = setup?.startCommand ?? ["npx", "-y", "framejam", "start"];
  const skillSource = setup?.skillSource ?? "moritzkremb/framejam";
  const fromNpm = cmd[0] === "npx";
  const cmdLine = cmd.map(shellQuote).join(" ");
  const add =
    harness === "cursor"
      ? `add an MCP server named "framejam" to ~/.cursor/mcp.json (command "${cmd[0]}", args ${JSON.stringify(cmd.slice(1))})`
      : `run \`${harness} mcp add framejam -- ${cmdLine}\``;
  const skillsAgent = HARNESSES.find((h) => h.id === harness)!.skillsAgent;
  const skills = `run \`npx -y skills add ${shellQuote(skillSource)} -g -a ${skillsAgent} -y\` to install the FrameJam skill`;
  const startLine = `run \`${startCmd.map(shellQuote).join(" ")}\` and open the URL it prints in your built-in browser (or give me the link if you don't have one)`;
  const needs =
    "FrameJam needs Node 22+ and ffmpeg: check `node -v` and `ffmpeg -version` and tell me how to install anything that's missing." +
    (fromNpm ? " If the MCP server can't start because npx isn't found, use the full path from `which npx` as the command." : "");
  return `Install FrameJam for me: ${add}, ${skills}, then ${startLine}. ${needs} ${RESTART_PROMPT[harness]}`;
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
export function PromptBlock({ text, primary, onCopy }: { text: string; primary?: boolean; onCopy?(): void }) {
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
            onCopy?.();
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
  const [copiedFor, setCopiedFor] = useState<Harness | null>(null);
  const label = HARNESSES.find((h) => h.id === harness)!.label;
  const waiting = !done[0] && copiedFor === harness;
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
          <PromptBlock text={setupPrompt(harness, health?.setup)} primary={current === 0} onCopy={() => setCopiedFor(harness)} />
          {waiting && (
            <div className="fc-col" style={{ gap: 2, margin: "10px 0 0" }} data-testid="setup-waiting">
              <span className="fc-agent working">
                <span className="dot" />
                Waiting for {label} to connect
              </span>
              <p className="sd" style={{ margin: 0 }}>
                {RESTART_HINT[harness]}
              </p>
            </div>
          )}
          <p className="sd fc-t3" style={{ margin: "8px 0 0" }}>
            Needs Node 22+ and ffmpeg.{" "}
            <a href={`${DOCS_URL}/install#manual`} target="_blank" rel="noreferrer">
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
