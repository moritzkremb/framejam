import { useCallback, useEffect, useState } from "react";
import { DOCS_URL, HomeHeader } from "@/components/header";
import { SetupSteps } from "@/components/setup-steps";
import { isOffline, Offline } from "@/components/states";
import { agentLabel, api, type Health } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SetupPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [hasReview, setHasReview] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([api.health(), api.reviews()])
      .then(([h, r]) => {
        setHealth(h);
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

  const agent = agentLabel(health?.agent);

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main fc-narrow">
        <div>
          <h1 className="fc-h1">Setup</h1>
          <p className="fc-lede">
            Three messages to paste into your agent chat. Each step ticks itself off. More in the{" "}
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="fc-link">
              docs
            </a>
            .
          </p>
        </div>
        {error && !health ? (
          isOffline(error) ? (
            <Offline />
          ) : (
            <p className="fc-caption">{String((error as Error).message)}</p>
          )
        ) : !health ? (
          <div className="fc-skel" style={{ height: 240 }} aria-busy="true" />
        ) : (
          <>
            <span className={cn("fc-agent", agent && "connected")}>
              <span className="dot" />
              {agent ? `Connected to ${agent}` : "No agent connected yet"}
            </span>
            <SetupSteps health={health} agentName={agent} hasReview={hasReview} />
          </>
        )}
      </main>
    </div>
  );
}
