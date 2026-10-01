import { ArrowRight, Clapperboard, Code2, Film, Layers, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConnectCard } from "@/components/connect-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, relativeTime, type ReviewListItem } from "@/lib/api";

export function HomePage() {
  const [reviews, setReviews] = useState<ReviewListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .reviews()
      .then((r) => {
        setReviews(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 px-3 py-6 sm:px-5 lg:grid-cols-[1fr_420px]">
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Reviews</h1>
            <p className="text-sm text-muted-foreground">Every video your agent has sent for review, newest first.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Couldn't reach the framecut server: {error}
          </div>
        )}

        {!reviews && !error && (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {reviews && reviews.length === 0 && (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-secondary">
              <Clapperboard className="size-5 text-muted-foreground" />
            </div>
            <h2 className="mt-4 font-medium">No reviews yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              When your agent renders a video and calls <code className="text-xs">open_review</code>, it shows up here
              with a player, a timeline, and a Send to agent button.
            </p>
            <Button asChild variant="secondary" className="mt-5 gap-1.5">
              <Link to="/presets">
                Pick a style while you wait <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}

        {reviews && reviews.length > 0 && (
          <ul className="grid gap-2.5">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/review/${r.id}`}
                  className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary">
                    {r.hasComposition ? <Code2 className="size-5 text-primary" /> : <Film className="size-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{r.title}</p>
                      {r.agentWaiting && (
                        <Badge className="gap-1 bg-emerald-500/15 text-emerald-300">
                          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Agent waiting
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="size-3" /> v{r.versions}
                      </span>
                      <span>{r.openComments} open</span>
                      {r.draftComments > 0 && <span className="text-primary">{r.draftComments} unsent</span>}
                      <span>{r.resolvedComments} resolved</span>
                      <span>updated {relativeTime(r.updatedAt)}</span>
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="grid content-start gap-4">
        <ConnectCard />
        <div className="rounded-xl border bg-card p-4 text-sm sm:p-5">
          <h3 className="font-medium">How the loop works</h3>
          <ol className="mt-3 grid gap-2.5 text-muted-foreground">
            {[
              "Pick a style in Presets and press Use this style.",
              "Your agent builds the Hyperframes composition, renders it, and opens a review.",
              "Click the frame (or press C) to pin a comment. Drag on the timeline to mark a range.",
              "Press Send to agent. The agent's waiting tool call returns your comments instantly.",
              "The agent edits, adds v2, and resolves what it fixed.",
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[11px] text-foreground">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
