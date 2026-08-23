import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { formatCount, formatDuration, timeAgo, type FeedVideo } from "@/lib/videos";
import { recordVideoView } from "@/lib/monetization";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<{ id: string; body: string; created_at: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const elRef = useRef<HTMLVideoElement | null>(null);
  const watchedRef = useRef(0);
  const lastTickRef = useRef(0);
  const sentRef = useRef(false);

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

  useEffect(() => {
    let active = true;
    async function loadSocialState() {
      const [{ count: likeCount }, { data: commentsData }] = await Promise.all([
        supabase.from("video_likes").select("id", { count: "exact", head: true }).eq("video_id", video.id),
        supabase
          .from("video_comments")
          .select("id,body,created_at")
          .eq("video_id", video.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (!active) return;
      setLikesCount(likeCount ?? 0);
      setComments(commentsData ?? []);

      if (user) {
        const [{ data: like }, { data: follow }] = await Promise.all([
          supabase.from("video_likes").select("id").eq("video_id", video.id).eq("user_id", user.id).maybeSingle(),
          supabase
            .from("follows")
            .select("id")
            .eq("follower_id", user.id)
            .eq("following_id", video.user_id)
            .maybeSingle(),
        ]);
        if (active) {
          setLiked(Boolean(like));
          setFollowing(Boolean(follow));
        }
      }
    }
    void loadSocialState();
    return () => {
      active = false;
    };
  }, [user, video.id, video.user_id]);

  async function toggleLike() {
    if (!user) {
      toast.error("Sign in to like videos");
      return;
    }
    setActionBusy("like");
    try {
      if (liked) {
        const { error } = await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", video.id)
          .eq("user_id", user.id);
        if (error) throw error;
        setLiked(false);
        setLikesCount((count) => Math.max(0, count - 1));
      } else {
        const { error } = await supabase.from("video_likes").insert({ video_id: video.id, user_id: user.id });
        if (error) throw error;
        setLiked(true);
        setLikesCount((count) => count + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update like");
    } finally {
      setActionBusy(null);
    }
  }

  async function toggleFollow() {
    if (!user) {
      toast.error("Sign in to follow creators");
      return;
    }
    if (user.id === video.user_id) return;
    setActionBusy("follow");
    try {
      if (following) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", video.user_id);
        if (error) throw error;
        setFollowing(false);
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: video.user_id });
        if (error) throw error;
        setFollowing(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update follow");
    } finally {
      setActionBusy(null);
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }
    const body = commentText.trim();
    if (!body) return;
    setActionBusy("comment");
    try {
      const { data, error } = await supabase
        .from("video_comments")
        .insert({ video_id: video.id, user_id: user.id, body })
        .select("id,body,created_at")
        .single();
      if (error) throw error;
      setComments((current) => [data, ...current]);
      setCommentText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add comment");
    } finally {
      setActionBusy(null);
    }
  }

  async function shareVideo() {
    const shareData = { title: video.title, text: video.description ?? video.title, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Video link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this video");
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-lift transition-transform hover:-translate-y-0.5">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-secondary">
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

      <div className="px-5 pt-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{video.title}</h3>
        {video.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-brand">
          {initials(video.creator.display_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{video.creator.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {video.creator.location ? `${video.creator.location} · ` : ""}
            {formatCount(video.views_count)} views · {timeAgo(video.created_at)}
          </p>
        </div>
        {user?.id !== video.user_id ? (
          <button
            type="button"
            onClick={() => void toggleFollow()}
            disabled={actionBusy !== null}
            className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-bold transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {following ? "Following" : "Follow"}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-5 border-t border-border/80 px-5 py-3.5 text-muted-foreground">
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={actionBusy !== null}
          className={`flex items-center gap-1.5 text-sm transition-colors hover:text-brand disabled:opacity-50 ${liked ? "text-brand" : ""}`}
        >
          <Heart className="size-[18px]" fill={liked ? "currentColor" : "none"} /> {likesCount}
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((open) => !open)}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand"
        >
          <MessageCircle className="size-[18px]" /> {comments.length}
        </button>
        <button
          type="button"
          onClick={() => void shareVideo()}
          className="ml-auto flex items-center gap-1.5 text-sm transition-colors hover:text-brand"
        >
          <Share2 className="size-[18px]" /> Share
        </button>
      </div>

      {commentsOpen ? (
        <div className="border-t border-border/80 px-5 py-4">
          {user ? (
            <form onSubmit={(event) => void addComment(event)} className="flex gap-2">
              <input
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                maxLength={500}
                placeholder="Add a comment"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={actionBusy !== null || !commentText.trim()}
                className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
              >
                Post
              </button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Sign in to join the conversation.</p>
          )}
          <div className="mt-3 space-y-2">
            {comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <p key={comment.id} className="rounded-xl bg-background px-3 py-2 text-sm">
                  {comment.body}
                </p>
              ))
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
