import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatCount, formatDuration, timeAgo, type FeedVideo } from "@/lib/videos";
import { recordVideoView } from "@/lib/monetization";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UploadedVideoCard({ video }: { video: FeedVideo }) {
  const [playing, setPlaying] = useState(false);
  const elRef = useRef<HTMLVideoElement | null>(null);
  const watchedRef = useRef(0);
  const lastTickRef = useRef(0);
  const sentRef = useRef(false);
  const navigate = useNavigate();

  // Verified view engine: accumulate real watch time and submit once per mount.
  const flush = () => {
    const el = elRef.current;
    if (sentRef.current || !el || watchedRef.current <= 0) return;
    sentRef.current = true;
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
    const percent = duration ? (watchedRef.current / duration) * 100 : 0;
    void recordVideoView({
      videoId: video.id,
      watchSeconds: watchedRef.current,
      percentWatched: percent,
    });
  };

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVideoClick = () => {
    navigate({ to: "/video/$id", params: { id: video.id } });
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-secondary cursor-pointer group" onClick={handleVideoClick}>
        <video
          ref={elRef}
          src={video.videoUrl ?? undefined}
          poster={video.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          onPlay={(e) => {
            setPlaying(true);
            lastTickRef.current = e.currentTarget.currentTime;
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            const delta = t - lastTickRef.current;
            if (delta > 0 && delta < 2) watchedRef.current += delta;
            lastTickRef.current = t;
          }}
          onPause={() => {
            setPlaying(false);
            flush();
          }}
          onEnded={flush}
          className="size-full object-cover"
        />

        {!playing ? (
          <>
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold backdrop-blur">
              {video.category}
            </span>
            {video.duration_seconds ? (
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                {formatDuration(video.duration_seconds)}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="px-4 pt-3">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug cursor-pointer hover:text-brand transition-colors" onClick={handleVideoClick}>
          {video.title}
        </h3>
        {video.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-brand cursor-pointer hover:opacity-80 transition-opacity" onClick={handleVideoClick}>
          {initials(video.creator.display_name)}
        </span>
        <div className="min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleVideoClick}>
          <p className="truncate text-sm font-semibold">{video.creator.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {video.creator.location ? `${video.creator.location} · ` : ""}
            {formatCount(video.views_count)} views · {timeAgo(video.created_at)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5 border-t border-border px-4 py-3 text-muted-foreground">
        <button type="button" className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand" onClick={() => navigate({ to: "/video/$id", params: { id: video.id } })}>
          <Heart className="size-[18px]" /> {formatCount(video.views_count)}
        </button>
        <button type="button" className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand" onClick={() => navigate({ to: "/video/$id", params: { id: video.id } })}>
          <MessageCircle className="size-[18px]" /> 0
        </button>
        <button type="button" className="ml-auto flex items-center gap-1.5 text-sm transition-colors hover:text-brand" onClick={() => navigate({ to: "/video/$id", params: { id: video.id } })}>
          <Share2 className="size-[18px]" /> Share
        </button>
      </div>
    </article>
  );
}
