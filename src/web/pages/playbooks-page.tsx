import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HomeHeader } from "@/components/header";
import { isOffline, Offline } from "@/components/states";
import { api, type PlaybookSummary } from "@/lib/api";
import { usePlaybookSelection } from "@/lib/use-playbook";
import { cn } from "@/lib/utils";
import { costBadge } from "../../shared/playbooks";

const FORMATS = ["All", "16:9", "9:16"] as const;

function PlaybookCard({ playbook, inUse, busy, onUse }: { playbook: PlaybookSummary; inUse: boolean; busy: boolean; onUse(): void }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const open = () => navigate(`/playbooks/${playbook.id}`);
  return (
    <div
      className={cn("fc-scard", inUse && "is-selected")}
      data-testid="playbook-card"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          v.load();
        }
      }}
    >
      <div className="media" style={{ background: "#0b0b0a" }}>
        {playbook.previewUrl ? (
          <video
            ref={videoRef}
            src={playbook.previewUrl}
            poster={playbook.posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={playbook.format === "16:9" ? "cover" : "contain"}
          />
        ) : playbook.posterUrl ? (
          <img src={playbook.posterUrl} alt="" className="contain" />
        ) : null}
        <button
          type="button"
          className={cn("fc-use use", inUse && "on")}
          data-testid="use-playbook-quick"
          disabled={busy}
          aria-pressed={inUse}
          onClick={(e) => {
            e.stopPropagation();
            onUse();
          }}
        >
          {inUse ? (
            <>
              <Check className="fc-i" />
              In use
            </>
          ) : (
            "Use"
          )}
        </button>
        <span className="br fc-badge on-video">{costBadge(playbook.needs)}</span>
      </div>
      <div>
        <div className="name">
          <span className="fc-truncate">{playbook.name}</span>
        </div>
        <div className="tagline">{playbook.tagline}</div>
        <div className="fc-caption fc-truncate">by {playbook.creator.name}</div>
      </div>
    </div>
  );
}

export function PlaybooksPage() {
  const [data, setData] = useState<{ selected: string | null; playbooks: PlaybookSummary[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [format, setFormat] = useState<string>("All");
  const [query, setQuery] = useState("");
  const selection = usePlaybookSelection(null);
  const { setSelected } = selection;

  useEffect(() => {
    api
      .playbooks()
      .then((d) => {
        setData(d);
        setSelected(d.selected);
      })
      .catch(setError);
  }, [setSelected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.playbooks ?? []).filter(
      (p) =>
        (format === "All" || p.format === format || p.format === "any") &&
        (!q || [p.name, p.tagline, p.description, p.get, ...p.bring, ...(p.tags ?? [])].join(" ").toLowerCase().includes(q)),
    );
  }, [data, format, query]);

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main">
        <div>
          <h1 className="fc-h1">Playbooks</h1>
          <p className="fc-lede">
            A playbook is how a kind of video gets made: what you bring, the steps and the tools. Styles set the look. Press Use, and your agent follows it.
          </p>
        </div>
        {error && !data ? (
          isOffline(error) ? <Offline /> : <p className="fc-caption">{String((error as Error).message)}</p>
        ) : (
          <>
            <div className="fc-col">
              <label className="fc-search">
                <Search className="fc-i sm" />
                <input
                  className="fc-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={data?.playbooks.length === 1 ? "Search 1 playbook" : `Search ${data?.playbooks.length ?? ""} playbooks`}
                />
              </label>
              <div className="fc-filters">
                <div className="fc-seg" role="group" aria-label="Format">
                  {FORMATS.map((f) => (
                    <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {!data ? (
              <div className="fc-sgrid">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="fc-skel" style={{ aspectRatio: "4 / 3.6" }} />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="fc-empty">
                <div className="fc-h3">No playbooks match</div>
                <button
                  type="button"
                  className="fc-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setFormat("All");
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="fc-sgrid">
                {visible.map((p) => (
                  <PlaybookCard
                    key={p.id}
                    playbook={p}
                    inUse={selection.selected === p.id}
                    busy={selection.busy === p.id}
                    onUse={() => void selection.toggle(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
