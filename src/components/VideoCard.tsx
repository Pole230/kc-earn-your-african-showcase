import { Heart, MessageCircle, Play, Share2 } from "lucide-react";
import type { VideoPost } from "@/data/content";

export function VideoCard({ post, priority = false }: { post: VideoPost; priority?: boolean }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <img
          src={post.thumbnail}
          alt={post.title}
          width={576}
          height={768}
          loading={priority ? "eager" : "lazy"}
          className="size-full object-cover"
        />
        <div className="veil absolute inset-0" />
        <span className="absolute left-3 top-3 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
          {post.category}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          {post.duration}
        </span>
        <button
          type="button"
          aria-label={`Play ${post.title}`}
          className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background/60 text-foreground backdrop-blur transition-transform hover:scale-105"
        >
          <Play className="size-6 translate-x-[2px]" fill="currentColor" />
        </button>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
            {post.title}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-brand">
          {post.creator.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{post.creator.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {post.creator.location} · {post.views} views · {post.postedAt}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5 border-t border-border px-4 py-3 text-muted-foreground">
        <span className="flex items-center gap-1.5 text-sm">
          <Heart className="size-[18px]" /> {post.likes}
        </span>
        <span className="flex items-center gap-1.5 text-sm">
          <MessageCircle className="size-[18px]" /> {post.comments}
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1.5 text-sm transition-colors hover:text-brand"
        >
          <Share2 className="size-[18px]" /> Share
        </button>
      </div>
    </article>
  );
}
