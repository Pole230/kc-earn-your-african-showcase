import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, MessageCircle, Share2, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCount, formatDuration, timeAgo, type FeedVideo } from "@/lib/videos";
import { likeVideo, unlikeVideo, fetchUserLike } from "@/lib/likes";
import { fetchComments, addComment } from "@/lib/comments";
import { fetchFollowStatus, followUser, unfollowUser } from "@/lib/follows";
import { shareVideo, getShareText, generateShareUrl } from "@/lib/sharing";

export const Route = createFileRoute("/video/$id")(
  {
    head: () => ({
      meta: [
        { title: "Video — KC Earn" },
        { name: "description", content: "Watch video on KC Earn" },
      ],
    }),
  },
  {
    component: VideoDetail,
  },
);

function VideoDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();

  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Fetch video details
  const { data: video, isLoading: videoLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select(
          "id,title,description,category,duration_seconds,views_count,likes_count,created_at,status,user_id,video_path,thumbnail_path"
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch creator profile
  const { data: creator } = useQuery({
    queryKey: ["creator", video?.user_id],
    queryFn: async () => {
      if (!video?.user_id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,username,location")
        .eq("id", video.user_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!video?.user_id,
  });

  // Fetch video URLs
  const { data: videoUrl } = useQuery({
    queryKey: ["videoUrl", video?.video_path],
    queryFn: async () => {
      if (!video?.video_path) return null;
      const { data } = await supabase.storage
        .from("videos")
        .createSignedUrl(video.video_path, 60 * 60);
      return data?.signedUrl || null;
    },
    enabled: !!video?.video_path,
  });

  const { data: thumbnailUrl } = useQuery({
    queryKey: ["thumbnailUrl", video?.thumbnail_path],
    queryFn: async () => {
      if (!video?.thumbnail_path) return null;
      const { data } = await supabase.storage
        .from("thumbnails")
        .createSignedUrl(video.thumbnail_path, 60 * 60);
      return data?.signedUrl || null;
    },
    enabled: !!video?.thumbnail_path,
  });

  // Fetch user's like status
  const { data: isLiked, refetch: refetchLike } = useQuery({
    queryKey: ["userLike", user?.id, id],
    queryFn: async () => {
      if (!user?.id || !id) return false;
      const like = await fetchUserLike(user.id, id);
      return !!like;
    },
    enabled: !!user?.id && !!id,
  });

  // Fetch comments
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      if (!id) return [];
      return fetchComments(id);
    },
    enabled: !!id,
  });

  // Fetch follow status
  const { data: isFollowing, refetch: refetchFollowStatus } = useQuery({
    queryKey: ["followStatus", user?.id, video?.user_id],
    queryFn: async () => {
      if (!user?.id || !video?.user_id) return false;
      return fetchFollowStatus(user.id, video.user_id);
    },
    enabled: !!user?.id && !!video?.user_id,
  });

  const handleLike = async () => {
    if (!user?.id || !id) {
      toast.error("Sign in to like videos");
      return;
    }

    if (isLiked) {
      await unlikeVideo(user.id, id);
      toast.success("Unliked");
    } else {
      await likeVideo(user.id, id);
      toast.success("Liked!");
    }
    await refetchLike();
    await queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const handleAddComment = async () => {
    if (!user?.id || !id) {
      toast.error("Sign in to comment");
      return;
    }

    if (!comment.trim()) {
      toast.error("Comment cannot be empty");
      return;
    }

    setSubmittingComment(true);
    try {
      await addComment(user.id, id, comment);
      setComment("");
      await refetchComments();
      toast.success("Comment posted!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleFollow = async () => {
    if (!user?.id || !video?.user_id) {
      toast.error("Sign in to follow");
      return;
    }

    if (isFollowing) {
      await unfollowUser(user.id, video.user_id);
      toast.success("Unfollowed");
    } else {
      await followUser(user.id, video.user_id);
      toast.success("Following!");
    }
    await refetchFollowStatus();
  };

  const handleShare = async () => {
    if (!video) return;
    const shareUrl = generateShareUrl(window.location.origin, id);
    const shareText = getShareText(video.title, creator?.display_name || "Creator");
    const success = await shareVideo(video.title, shareUrl, shareText);
    if (success) {
      toast.success("Shared!");
    }
  };

  if (videoLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-5">
        <h1 className="text-2xl font-bold">Video not found</h1>
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2"
        >
          <ArrowLeft className="size-4" /> Go back
        </button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Video player */}
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        <button
          onClick={() => navigate({ to: "/" })}
          className="absolute left-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-background/70 text-foreground transition-colors hover:bg-background"
        >
          <ArrowLeft className="size-5" />
        </button>
        <video
          src={videoUrl ?? undefined}
          poster={thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      </div>

      {/* Video info */}
      <div className="px-5 py-6">
        <h1 className="text-2xl font-bold leading-tight">{video.title}</h1>

        {video.description && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{video.description}</p>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{video.category}</span>
          <span>·</span>
          <span>{formatCount(video.views_count)} views</span>
          <span>·</span>
          <span>{timeAgo(video.created_at)}</span>
        </div>

        {/* Creator card */}
        {creator && (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-brand">
                {creator.display_name
                  .split(" ")
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(""
                  .toUpperCase())}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{creator.display_name}</p>
                {creator.location && (
                  <p className="truncate text-xs text-muted-foreground">{creator.location}</p>
                )}
              </div>
            </div>
            {user?.id !== video.user_id && (
              <button
                onClick={handleFollow}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  isFollowing
                    ? "border border-border bg-surface text-foreground hover:bg-muted"
                    : "gradient-brand text-brand-foreground"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex items-center gap-3 border-t border-border pt-6">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              isLiked
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className={`size-5 ${isLiked ? "fill-current" : ""}`} />
            {formatCount(video.likes_count)}
          </button>
          <button className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <MessageCircle className="size-5" />
            {comments.length}
          </button>
          <button
            onClick={handleShare}
            className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <Share2 className="size-5" /> Share
          </button>
        </div>
      </div>

      {/* Comments section */}
      <div className="border-t border-border px-5 py-6">
        <h2 className="text-lg font-bold">Comments</h2>

        {user?.id && (
          <div className="mt-4 flex gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-brand">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-brand"
                rows={3}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleAddComment}
                  disabled={submittingComment || !comment.trim()}
                  className="gradient-brand rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                >
                  {submittingComment ? <Loader2 className="size-4 animate-spin" /> : "Post"}
                </button>
              </div>
            </div>
          </div>
        )}

        {!user?.id && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-4 text-center">
            <p className="text-sm text-muted-foreground">Sign in to comment</p>
            <Link
              to="/auth"
              className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
            >
              Sign in
            </Link>
          </div>
        )}

        {/* Comments list */}
        <div className="mt-6 space-y-4">
          {comments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No comments yet</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-brand">
                  {c.creator?.display_name
                    ?.charAt(0)
                    .toUpperCase() || "?"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">
                      {c.creator?.display_name || "Anonymous"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(c.created_at)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-foreground leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
