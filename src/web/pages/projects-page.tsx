import { ChevronRight, Cloud, Film, Inbox, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CommunityCard, MadeBy } from "@/components/community";
import { HomeHeader } from "@/components/header";
import { CodeBlock, FIRST_VIDEO_PROMPT, PromptBlock, SetupSteps } from "@/components/setup-steps";
import { isOffline, Offline } from "@/components/states";
import { UpdateNotice } from "@/components/update-notice";
import { agentLabel, api, posterUrl, relativeTime, type Health, type ReviewListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { reviewStatus } from "../../core/review-status";

function Poster({ review }: { review: ReviewListItem }) {
  const [shape, setShape] = useState<"tall" | "wide">("wide");
  const [failed, setFailed] = useState(!review.hasVideo && !review.panels);
  return (
    <div className={cn("poster", shape === "tall" && "tall")}>
      {failed ? (
        <span className="ph">
          {review.panels ? <LayoutGrid className="fc-i sm" /> : <Film className="fc-i sm" />}
        </span>
      ) : (
        <>
          {shape === "tall" && <img className="backdrop" src={posterUrl(review.id, review.latestVersion)} alt="" aria-hidden />}
          <img
            src={posterUrl(review.id, review.latestVersion)}
            alt=""
            loading="lazy"
            onLoad={(e) => setShape(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth ? "tall" : "wide")}
            onError={() => setFailed(true)}
          />
        </>
      )}
    </div>
  );
}

function ProjectCard({ review }: { review: ReviewListItem }) {
  const status = reviewStatus(review);
  return (
    <Link to={`/review/${review.id}`} className="fc-rcard" data-testid="project-card" data-status={status.kind}>
      <Poster review={review} />
      <div className="fc-grow">
        <div className="name">
          {review.title}
          {review.cloud && (
            <span className="fc-cloud-tag" data-testid="cloud-tag" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              <Cloud className="fc-i" /> Cloud
            </span>
          )}
        </div>
        <div className={cn("state", status.tone)}>
          {status.working ? (
            <span className="fc-agent working" style={{ gap: 0 }}>
              <span className="dot" />
            </span>
          ) : (
            <span className="dot" />
          )}
          {status.text}
        </div>
        <div className="meta">
          {review.versions} version{review.versions === 1 ? "" : "s"}
          {review.panels ? ` · Storyboard, ${review.panels} panels` : ""} · {relativeTime(review.updatedAt)}
        </div>
      </div>
      <ChevronRight className="fc-i sm fc-t3" />
    </Link>
  );
}

/** Home: every project, the ones waiting on you first. Setup shows here only until an agent has connected. */
export function ProjectsPage() {
  const [reviews, setReviews] = useState<ReviewListItem[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([api.reviews(), api.health()])
      .then(([r, h]) => {
        setReviews(r);
        setHealth(h);
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
  const needsYou = (reviews ?? []).filter((r) => reviewStatus(r).needsYou);
  const withAgent = (reviews ?? []).filter((r) => !reviewStatus(r).needsYou);

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main fc-narrow">
        <UpdateNotice />
        {health?.cloud?.signedOut && (
          <section className="fc-card fc-col" style={{ gap: 10 }} aria-label="Cloud mode" data-testid="cloud-signed-out">
            <div>
              <b>Cloud mode is on, but you're signed out.</b> <span className="fc-t2">New projects stay on this computer until you sign in. Paste this in a terminal:</span>
            </div>
            <CodeBlock code="npx -y framejam login" />
          </section>
        )}
        <div>
          <p className="fc-kicker">{health?.cloud?.on && !health.cloud.signedOut ? "Cloud mode" : "On this computer"}</p>
          <h1 className="fc-h1">Projects</h1>
        </div>
        {error && !reviews ? (
          isOffline(error) ? (
            <Offline />
          ) : (
            <p className="fc-caption">{String((error as Error).message)}</p>
          )
        ) : !reviews || !health ? (
          <div className="fc-col" style={{ gap: 8 }} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="fc-skel" style={{ height: 76 }} />
            ))}
          </div>
        ) : (
          <>
            {!agent && (
              <section className="fc-card fc-col" style={{ gap: 14 }} aria-labelledby="setup-title" data-testid="setup-checklist">
                <div>
                  <h2 id="setup-title" className="fc-h2">
                    Connect your agent to <em>get started</em>
                  </h2>
                  <p className="fc-caption" style={{ margin: "2px 0 0" }}>
                    Paste these into your agent chat. Each step ticks itself off, and this goes away once your agent connects.
                  </p>
                </div>
                <SetupSteps health={health} agentName={agent} hasReview={reviews.length > 0} />
              </section>
            )}

            {reviews.length === 0 ? (
              agent && (
                <div className="fc-card fc-col" style={{ gap: 14 }} data-testid="projects-empty">
                  <div className="fc-row" style={{ gap: 12, flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <Inbox className="fc-i fc-t2" />
                    <div>
                      <div className="fc-h2">
                        No projects <em>yet</em>
                      </div>
                      <p className="fc-caption" style={{ margin: "2px 0 0", fontSize: 13, lineHeight: "19px" }}>
                        Paste this into your agent chat. Its first version shows up here.
                      </p>
                    </div>
                  </div>
                  <PromptBlock text={FIRST_VIDEO_PROMPT} primary />
                </div>
              )
            ) : (
              <div className="fc-col" style={{ gap: 8 }}>
                {needsYou.length > 0 && <div className="fc-label">Needs you</div>}
                {needsYou.map((r) => (
                  <ProjectCard key={r.id} review={r} />
                ))}
                {withAgent.length > 0 && (
                  <div className="fc-label" style={{ marginTop: needsYou.length ? 12 : 0 }}>
                    With your agent
                  </div>
                )}
                {withAgent.map((r) => (
                  <ProjectCard key={r.id} review={r} />
                ))}
              </div>
            )}

            {agent && <CommunityCard source="app-projects" />}

            <div className="fc-row fc-home-foot" data-testid={agent ? "setup-collapsed" : undefined}>
              {agent && (
                <span className="fc-agent connected">
                  <span className="dot" />
                  Connected to {agent}
                </span>
              )}
              <span className="fc-grow" />
              <MadeBy />
              {agent && (
                <Link to="/setup" className="fc-btn ghost sm">
                  Setup
                </Link>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
