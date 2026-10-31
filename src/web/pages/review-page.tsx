import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BackHeader } from "@/components/header";
import { ComparePage, comparableVersions } from "@/components/review/compare";
import type { ReviewRole } from "@/components/review/numbering";
import { UploadWait } from "@/components/review/review-shell";
import { StoryboardReview } from "@/components/review/storyboard";
import { useReview, useWidth } from "@/components/review/use-review";
import { VideoReview } from "@/components/review/video-review";
import { isOffline, NotHere, Offline } from "@/components/states";
import { localDataSource, type ReviewDataSource } from "@/lib/data-source";

/** Loads the review, then shows the video or storyboard view for the version on screen. */
export function ReviewPage({ data = localDataSource, role = "local" }: { data?: ReviewDataSource; role?: ReviewRole }) {
  const { id = "" } = useParams();
  const resumeTime = useRef(0);
  const r = useReview(id, data, () => {
    resumeTime.current = 0;
  });
  const { ref: rootRef, width } = useWidth<HTMLDivElement>();
  const [compare, setCompare] = useState<[number, number] | null>(null);

  if (r.loadError && !r.review) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <BackHeader to="/" title="Project" />
        <main className="fc-main">
          {isOffline(r.loadError) ? (
            <Offline />
          ) : (
            <NotHere
              title={<>This project isn't <em>here</em></>}
              message={role === "owner" ? "It may have been deleted, or it's in another account." : "It may have been deleted, or the link is from another computer."}
            />
          )}
        </main>
      </div>
    );
  }

  if (!r.review || !r.version || !r.latest) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <BackHeader to="/" title="Loading project" />
        <main className="fc-main">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 56 }} />
        </main>
      </div>
    );
  }

  if (compare) {
    return <ComparePage review={r.review} data={data} initial={compare} onClose={() => setCompare(null)} />;
  }

  const playable = comparableVersions(r.review, data);
  const onCompare =
    data.compare && playable.length >= 2
      ? () => {
          const newest = playable.at(-1)!.number;
          const before = playable.at(-2)!.number;
          setCompare(r.version!.number === newest ? [before, newest] : [r.version!.number, newest]);
        }
      : undefined;

  // The version is in the project before its video is: show how far the upload is, and the poster once it exists.
  if (!r.version.panels?.length && r.version.upload && !data.videoUrl(r.review.id, r.version.number)) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <UploadWait r={r} poster={data.poster?.(r.review.id, r.version.number)} onCompare={onCompare} />
      </div>
    );
  }

  return (
    <div className="fc-rshell" ref={rootRef}>
      {r.version.panels?.length ? <StoryboardReview r={r} width={width} role={role} /> : <VideoReview r={r} width={width} resumeTime={resumeTime} onCompare={onCompare} role={role} />}
    </div>
  );
}
