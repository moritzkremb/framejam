import { FileArchive, Loader2 } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ReviewVersion } from "@/lib/api";
import type { ReviewDataSource } from "@/lib/data-source";

const MB = 1024 * 1024;

function size(bytes: number) {
  return bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : bytes >= MB ? `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\((?:https?:\/\/)[^)\s]+\))|(https?:\/\/[^\s<>)]+)/g;

/** Inline markdown without HTML: code, bold and links to http(s) pages. Everything else is plain text. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [whole] = m;
    if (m[1]) out.push(<code key={key++}>{whole.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key++}>{whole.slice(2, -2)}</strong>);
    else if (m[3]) {
      const close = whole.indexOf("](");
      out.push(
        <a key={key++} href={whole.slice(close + 2, -1)} target="_blank" rel="noreferrer noopener">
          {whole.slice(1, close)}
        </a>,
      );
    } else {
      const url = whole.replace(/[.,;:!?]+$/, "");
      out.push(
        <a key={key++} href={url} target="_blank" rel="noreferrer noopener">
          {url}
        </a>,
      );
      if (url.length < whole.length) out.push(whole.slice(url.length));
    }
    last = m.index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The notes as paragraphs, lists, headings and code blocks. Safe for text written by anyone: nothing is parsed as HTML. */
export function NotesText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key++}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<h4 key={key++}>{inline(heading[1]!)}</h4>);
      i++;
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items: ReactNode[] = [];
      while (i < lines.length && re.test(lines[i]!)) items.push(<li key={items.length}>{inline(lines[i++]!.replace(re, ""))}</li>);
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !lines[i]!.trimStart().startsWith("```") && !/^#{1,6}\s/.test(lines[i]!) && !bullet.test(lines[i]!) && !numbered.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(
      <p key={key++}>
        {para.map((p, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}

/** Whether a version has anything for the Notes tab: handoff notes or source files. */
export function hasHandoff(version: ReviewVersion | undefined): boolean {
  return Boolean(version?.notes?.trim() || version?.source);
}

function SourceCard({ data, reviewId, version }: { data: ReviewDataSource; reviewId: string; version: ReviewVersion }) {
  const [busy, setBusy] = useState(false);
  const source = version.source;
  if (!source) return null;
  const download = data.sourceDownload;
  const get = async () => {
    if (!download || busy) return;
    setBusy(true);
    try {
      const got = await download(reviewId, version.number);
      const a = document.createElement("a");
      a.href = got.url;
      a.download = got.filename;
      a.rel = "noopener";
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fc-source" data-testid="version-source">
      <FileArchive className="fc-i" />
      <div className="body">
        <div className="name">{source.filename}</div>
        <div className="meta">
          {size(source.bytes)} · {source.ready ? "the project folder, ready to continue from" : "uploading with the version"}
        </div>
      </div>
      {download && (
        <button type="button" className="fc-btn sm" onClick={() => void get()} disabled={busy || !source.ready} data-testid="download-source">
          {busy && <Loader2 className="fc-i xs fc-spin" />}
          <span className="lbl">Download</span>
        </button>
      )}
    </div>
  );
}

/** The Notes tab: what the agent left with this version (what changed, how to continue) and its source files. */
export function VersionNotes({ data, reviewId, version }: { data: ReviewDataSource; reviewId: string; version: ReviewVersion }) {
  return (
    <div className="fc-notes" data-testid="version-notes">
      <div className="fc-notes-h">Version {version.number}</div>
      {version.note && <p className="fc-notes-line">{version.note}</p>}
      {version.notes?.trim() ? (
        <div className="fc-notes-body">
          <NotesText text={version.notes} />
        </div>
      ) : (
        <p className="fc-caption">No notes on this version.</p>
      )}
      <SourceCard data={data} reviewId={reviewId} version={version} />
    </div>
  );
}
