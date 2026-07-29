import { Heart, MessageCircle, Play, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { VideoPost } from "@/data/content";
import { useVideoLikes } from "@/hooks/useVideoLikes";
import { useComments } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";

export function VideoCard({ post, priority = false }: { post: VideoPost; priority?: boolean }) {
  const { likeCount, isLiked, likeVideo, unlikeVideo, liking, unliking } = useVideoLikes(post.id);
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const { user } = useAuth();

  const { comments, loading: commentsLoading, addComment, adding, deleteComment, deleting } = useComments(
    post.id,
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  const currentLiked = optimisticLiked ?? isLiked;

  // compute displayed count with optimistic delta when available
  const baseCount = likeCount ?? 0;
  let displayedCount = baseCount;
  if (optimisticLiked !== null && optimisticLiked !== isLiked) {
    displayedCount = optimisticLiked ? baseCount + 1 : Math.max(0, baseCount - 1);
  }

  function formatCount(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  }

  async function toggleLike() {
    if (currentLiked) {
      setOptimisticLiked(false);
      try {
        await unlikeVideo();
        setOptimisticLiked(null);
      } catch (err) {
        setOptimisticLiked(null);
        console.error(err);
      }
    } else {
      setOptimisticLiked(true);
      try {
        await likeVideo();
        setOptimisticLiked(null);
      } catch (err) {
        setOptimisticLiked(null);
        console.error(err);
      }
    }
  }

  async function submitComment() {
    if (commentText.trim() === "") return;
    try {
      await addComment(commentText.trim());
      setCommentText("");
      if (!commentsOpen) setCommentsOpen(true);
    } catch (err) {
      console.error(err);
    }
  }

  const likeButtonClass = `flex items-center gap-1.5 text-sm transition-colors ${
    currentLiked ? "text-brand" : "text-muted-foreground hover:text-brand"
  }`;

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
        <button
          type="button"
          onClick={toggleLike}
          disabled={liking || unliking}
          className={likeButtonClass}
          aria-pressed={currentLiked}
        >
          <Heart className="size-[18px]" /> {formatCount(displayedCount)}
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((s) => !s)}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand"
        >
          <MessageCircle className="size-[18px]" /> {commentsLoading ? "..." : comments.length}
        </button>
        <button type="button" className="ml-auto flex items-center gap-1.5 text-sm transition-colors hover:text-brand">
          <Share2 className="size-[18px]" /> Share
        </button>
      </div>

      {commentsOpen ? (
        <div className="border-t border-border px-4 py-3">
          <div className="space-y-3">
            {commentsLoading ? (
              <p className="text-sm text-muted-foreground">Loading comments…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet — be the first to comment.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-brand">
                    {c.profile?.initials ?? c.profile?.name?.[0] ?? "U"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{c.profile?.name ?? "Unknown"}</span>{" "}
                      <span className="text-muted-foreground">{c.body}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                  </div>
                  {user && c.user_id === user.id ? (
                    <button
                      type="button"
                      onClick={() => deleteComment(c.id)}
                      disabled={deleting}
                      className="grid size-8 place-items-center rounded-full text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={submitComment}
              disabled={adding}
              className="rounded-2xl bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground"
            >
              Post
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
