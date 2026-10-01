import { ChevronRight, Film, Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HomeHeader } from "@/components/header";
import { ConnectInstructions, SetupSteps } from "@/components/setup-steps";
import { isOffline, Offline } from "@/components/states";
import { agentLabel, api, posterUrl, relativeTime, type Health, type ReviewListItem } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Whose turn it is, in the review card's words. */
function reviewState(r: ReviewListItem): { text: string; tone: "you" | "agent" | "done"; working?: boolean } {
  if (r.latestSent && r.delivered) return { text: `Agent is working on v${r.latestVersion + 1}`, tone: "agent", working: true };
  if (r.latestSent) return { text: "Sent · tell your agent to pick it up", tone: "you" };
  if (r.draftComments) return { text: `${r.draftComments} comment${r.draftComments === 1 ? "" : "s"} not sent`, tone: "you" };
  if (r.agentWaiting) return { text: "Waiting for your feedback", tone: "agent" };
  return { text: `Version ${r.latestVersion} is ready to watch`, tone: "done" };
}

function Poster({ review }: { review: ReviewListItem }) {
  const [shape, setShape] = useState<"tall" | "wide">("wide");
  const [failed, setFailed] = useState(!review.hasVideo);
  return (
    <div className={cn("poster", shape === "wide" && "wide")}>
      {failed ? (
        <span className="ph">
          <Film className="fc-i sm" />
        </span>
      ) : (
        <img
          src={posterUrl(review.id, review.latestVersion)}
          alt=""
          loading="lazy"
          onLoad={(e) => setShape(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth ? "tall" : "wide")}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewListItem }) {
  const state = reviewState(review);
  return (
    <Link to={`/review/${review.id}`} className="fc-rcard" data-testid="review-card">
      <Poster review={review} />
      <div className="fc-grow">
        <div className="name">{review.title}</div>
        <div className={cn("state", state.tone)}>
          {state.working ? <span className="fc-agent working" style={{ gap: 0 }}><span className="dot" /></span> : <span className="dot" />}
          {state.text}
        </div>
        <div className="meta">
          v{review.latestVersion} · {relativeTime(review.updatedAt)}
        </div>
      </div>
      <ChevronRight className="fc-i sm fc-t3" />
    </Link>
  );
}

export function HomePage() {
  const [reviews, setReviews] = useState<ReviewListItem[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [styleName, setStyleName] = useState<string | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [showSetup, setShowSetup] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.reviews(), api.health(), api.presets()])
      .then(([r, h, p]) => {
        setReviews(r);
        setHealth(h);
        setStyleName(p.presets.find((x) => x.id === p.selected)?.name);
        setError(null);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const agent = agentLabel(health?.agent);

  if (error && !reviews) {
    return (
      <div className="fc-screen">
        <HomeHeader />
        <main className="fc-main">{isOffline(error) ? <Offline /> : <p className="fc-caption">{String((error as Error).message)}</p>}</main>
      </div>
    );
  }

  if (reviews && reviews.length === 0) {
    return (
      <div className="fc-screen">
        <HomeHeader />
        <main className="fc-main fc-narrow" style={{ gap: 24 }}>
          <div>
            <h1 className="fc-h1">Make your first video</h1>
            <p className="fc-lede">Frame Jam sits next to your agent. Your agent builds the video; you point at what to change.</p>
          </div>
          <SetupSteps agentName={agent} styleName={styleName} hasReview={false} />
          <div className="fc-card fc-row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "nowrap" }}>
            <Inbox className="fc-i fc-t2" />
            <div>
              <div className="fc-h3">Your review will appear here</div>
              <p className="fc-caption" style={{ margin: "2px 0 0", fontSize: 13, lineHeight: "19px" }}>
                When your agent opens a review, this page shows it right away.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const needsYou = (reviews ?? []).filter((r) => !(r.latestSent && r.delivered));
  const earlier = (reviews ?? []).filter((r) => r.latestSent && r.delivered);

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main fc-narrow">
        <h1 className="fc-h1">Reviews</h1>
        {!reviews ? (
          <div className="fc-col" style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="fc-skel" style={{ height: 76 }} />
            ))}
          </div>
        ) : (
          <div className="fc-col" style={{ gap: 8 }}>
            {needsYou.length > 0 && <div className="fc-caption">Needs you</div>}
            {needsYou.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {earlier.length > 0 && (
              <div className="fc-caption" style={{ marginTop: needsYou.length ? 12 : 0 }}>
                With your agent
              </div>
            )}
            {earlier.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}
        <div className="fc-home-foot">
          <div className="fc-row" style={{ justifyContent: "space-between" }}>
            <span className={cn("fc-agent", agent && "connected")}>
              <span className="dot" />
              {agent ? `Connected to ${agent}` : "No agent connected yet"}
            </span>
            <button type="button" className="fc-btn ghost sm" onClick={() => setShowSetup((s) => !s)}>
              {showSetup ? "Hide setup" : "Setup help"}
            </button>
          </div>
          {showSetup && (
            <div style={{ marginTop: 12 }}>
              <ConnectInstructions />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
