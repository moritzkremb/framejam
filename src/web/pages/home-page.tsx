import { ArrowRight, MessageSquare, Palette, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { HomeHeader } from "@/components/header";
import { SetupSteps } from "@/components/setup-steps";
import { isOffline, Offline } from "@/components/states";
import { agentLabel, api, type Health, type PresetSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Palette,
    title: "Pick a style",
    body: "Browse example videos and press Use. Your agent gets the palette, fonts, motion and a working template.",
  },
  {
    icon: MessageSquare,
    title: "Point at what to change",
    body: "Pause, click the frame, type. Your agent gets the timestamp, the element you clicked and the animation behind it.",
  },
  {
    icon: RefreshCw,
    title: "Get the next version",
    body: "Finish your review and your agent ships the next version into the same page. Repeat until it's right.",
  },
];

/** A still of a review: a style's poster with a comment pinned on it. */
function HeroVisual({ preset }: { preset?: PresetSummary }) {
  return (
    <div className="fc-hero-visual" aria-hidden>
      <div className="win">
        <div className="frame" style={{ background: preset?.palette.background ?? "var(--surface-2)" }}>
          {preset?.posterUrl && <img src={preset.posterUrl} alt="" />}
          <span className="fc-pin draft" style={{ left: "58%", top: "44%" }}>
            1
          </span>
          <div className="bubble" style={{ left: "calc(58% + 22px)", top: "calc(44% - 52px)" }}>
            <span className="when">0:02.4</span>
            Make this line pop more
          </div>
        </div>
        <div className="strip">
          <span className="played" />
          <span className="mark" style={{ left: "34%" }} />
          <span className="head" style={{ left: "34%" }} />
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [styleName, setStyleName] = useState<string | undefined>();
  const [hero, setHero] = useState<PresetSummary | undefined>();
  const [hasReview, setHasReview] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const setupRef = useRef<HTMLElement>(null);
  const location = useLocation();

  const load = useCallback(() => {
    Promise.all([api.health(), api.presets(), api.reviews()])
      .then(([h, p, r]) => {
        setHealth(h);
        setStyleName(p.presets.find((x) => x.id === p.selected)?.name);
        setHero((cur) => cur ?? p.presets.find((x) => x.id === "midnight-launch" && x.posterUrl) ?? p.presets.find((x) => x.format === "16:9" && x.posterUrl));
        setHasReview(r.length > 0);
        setError(null);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (location.hash === "#setup" && health) setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, health]);

  const agent = agentLabel(health?.agent);

  if (error && !health) {
    return (
      <div className="fc-screen">
        <HomeHeader />
        <main className="fc-main">{isOffline(error) ? <Offline /> : <p className="fc-caption">{String((error as Error).message)}</p>}</main>
      </div>
    );
  }

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-home">
        <section className="fc-hero">
          <div className="copy">
            <span className={cn("fc-eyebrow", agent && "on")}>
              <span className="dot" />
              {agent ? `Connected to ${agent}` : "For Hyperframes and your coding agent"}
            </span>
            <h1>
              Make videos with your agent.
              <span> Point at what to change.</span>
            </h1>
            <p>
              Frame Jam is a small app that runs next to your agent chat. Pick a look from a gallery of styles. When the video is ready, click
              right on the frame and type what should change. Your agent gets the exact moment, the element you clicked, and the animation
              behind it.
            </p>
            <div className="fc-row" style={{ gap: 8, marginTop: 4 }}>
              {agent ? (
                <Link to="/styles" className="fc-btn primary lg">
                  Pick a style <ArrowRight className="fc-i sm" />
                </Link>
              ) : (
                <button type="button" className="fc-btn primary lg" onClick={() => setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  Set up in one paste <ArrowRight className="fc-i sm" />
                </button>
              )}
              <Link to={agent ? "/projects" : "/styles"} className="fc-btn outline lg">
                {agent ? "Your projects" : "Browse styles"}
              </Link>
            </div>
          </div>
          <HeroVisual preset={hero} />
        </section>

        <section className="fc-how">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="item">
              <span className="ic">
                <Icon className="fc-i sm" />
              </span>
              <div className="t">
                <span className="n">{i + 1}</span>
                {title}
              </div>
              <p>{body}</p>
            </div>
          ))}
        </section>

        <section ref={setupRef} id="setup" className="fc-home-setup">
          <div>
            <h2 className="fc-h1">Set up</h2>
            <p className="fc-lede">Three messages to paste into your agent chat. Each step ticks itself off.</p>
          </div>
          <SetupSteps health={health} agentName={agent} styleName={styleName} hasReview={hasReview} />
        </section>
      </main>
    </div>
  );
}
