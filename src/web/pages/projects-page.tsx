import { ChevronRight, Film, Inbox, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HomeHeader } from "@/components/header";
import { FIRST_VIDEO_PROMPT, PromptBlock } from "@/components/setup-steps";
import { isOffline, Offline } from "@/components/states";
import { agentLabel, api, posterUrl, relativeTime, type Health, type ReviewListItem } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Whose turn it is, in the project card's words. */
function projectState(p: ReviewListItem): { text: string; tone: "you" | "agent" | "done"; working?: boolean } {
  if (p.latestSent && p.delivered) return { text: `Agent is working on v${p.latestVersion + 1}`, tone: "agent", working: true };
  if (p.latestSent) return { text: "Review finished · tell your agent to pick it up", tone: "you" };
  if (p.draftComments) return { text: `${p.draftComments} comment${p.draftComments === 1 ? "" : "s"}, review not finished`, tone: "you" };
  if (p.agentListening) return { text: "Your agent is waiting for your review", tone: "agent" };
  return { text: `Version ${p.latestVersion} is ready to ${p.panels ? "review" : "watch"}`, tone: "done" };
}

function Poster({ project }: { project: ReviewListItem }) {
  const [shape, setShape] = useState<"tall" | "wide">("wide");
  const [failed, setFailed] = useState(!project.hasVideo && !project.panels);
  return (
    <div className={cn("poster", shape === "wide" && "wide")}>
      {failed ? (
        <span className="ph">
          {project.panels ? <LayoutGrid className="fc-i sm" /> : <Film className="fc-i sm" />}
        </span>
      ) : (
        <img
          src={posterUrl(project.id, project.latestVersion)}
          alt=""
          loading="lazy"
          onLoad={(e) => setShape(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth ? "tall" : "wide")}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ReviewListItem }) {
  const state = projectState(project);
  return (
    <Link to={`/review/${project.id}`} className="fc-rcard" data-testid="project-card">
      <Poster project={project} />
      <div className="fc-grow">
        <div className="name">{project.title}</div>
        <div className={cn("state", state.tone)}>
          {state.working ? (
            <span className="fc-agent working" style={{ gap: 0 }}>
              <span className="dot" />
            </span>
          ) : (
            <span className="dot" />
          )}
          {state.text}
        </div>
        <div className="meta">
          v{project.latestVersion}
          {project.panels ? ` · Storyboard, ${project.panels} panels` : ""} · {relativeTime(project.updatedAt)}
        </div>
      </div>
      <ChevronRight className="fc-i sm fc-t3" />
    </Link>
  );
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ReviewListItem[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([api.reviews(), api.health()])
      .then(([p, h]) => {
        setProjects(p);
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
  const needsYou = (projects ?? []).filter((p) => !(p.latestSent && p.delivered));
  const earlier = (projects ?? []).filter((p) => p.latestSent && p.delivered);

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main fc-narrow">
        <div>
          <h1 className="fc-h1">Projects</h1>
          <p className="fc-lede">Every video and storyboard your agent made with you. Click one to watch it and say what should change.</p>
        </div>
        {error && !projects ? (
          isOffline(error) ? (
            <Offline />
          ) : (
            <p className="fc-caption">{String((error as Error).message)}</p>
          )
        ) : !projects ? (
          <div className="fc-col" style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="fc-skel" style={{ height: 76 }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="fc-card fc-col" style={{ gap: 14 }}>
            <div className="fc-row" style={{ gap: 12, flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Inbox className="fc-i fc-t2" />
              <div>
                <div className="fc-h3">No projects yet</div>
                <p className="fc-caption" style={{ margin: "2px 0 0", fontSize: 13, lineHeight: "19px" }}>
                  Ask your agent for a video. As soon as it has something to show you, it appears here.
                </p>
              </div>
            </div>
            <PromptBlock text={FIRST_VIDEO_PROMPT} primary />
            {!agent && (
              <Link to="/home#setup" className="fc-btn ghost sm" style={{ alignSelf: "flex-start", marginLeft: -10 }}>
                Agent not connected yet? Set up Frame Jam
              </Link>
            )}
          </div>
        ) : (
          <div className="fc-col" style={{ gap: 8 }}>
            {needsYou.length > 0 && <div className="fc-caption">Needs you</div>}
            {needsYou.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            {earlier.length > 0 && (
              <div className="fc-caption" style={{ marginTop: needsYou.length ? 12 : 0 }}>
                With your agent
              </div>
            )}
            {earlier.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
