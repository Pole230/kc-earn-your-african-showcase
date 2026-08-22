import { ExternalLink, Globe2 } from "lucide-react";
import { timeAgo, type ExternalFeedVideo } from "@/lib/videos";

export function ExternalVideoCard({ video }: { video: ExternalFeedVideo }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        <iframe
          src={video.embedUrl}
          title={video.title}
          className="size-full border-0"
          loading="lazy"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="px-4 pt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
          <Globe2 className="size-4" /> {video.source_platform} · external
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{video.title}</h3>
        {video.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{video.creator.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {video.creator.location ? `${video.creator.location} · ` : ""}
            {video.published_at ? timeAgo(video.published_at) : "source content"}
          </p>
        </div>
        <a
          href={video.original_url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original video"
          className="text-muted-foreground hover:text-brand"
        >
          <ExternalLink className="size-5" />
        </a>
      </div>
    </article>
  );
}
