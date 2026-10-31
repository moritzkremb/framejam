import { Component, type ReactNode } from "react";

/** A crash anywhere below shows this instead of an empty page. */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[framejam] the review page crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fc-empty fc-center" role="alert" style={{ minHeight: "100dvh", justifyContent: "center", gap: 12 }}>
        <div className="fc-h3">Something went wrong on this page</div>
        <p>Reload to try again. Your comments are saved.</p>
        <p style={{ opacity: 0.6, fontSize: 12, fontFamily: "var(--font-mono)", maxWidth: 520, overflowWrap: "anywhere" }}>
          {this.state.error.message}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="fc-btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="fc-btn" href="/projects">
            Your projects
          </a>
        </div>
      </main>
    );
  }
}
