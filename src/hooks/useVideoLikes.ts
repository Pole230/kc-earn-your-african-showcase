import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export async function getLikeCount(videoId: string): Promise<number> {
  const res = await supabase
    .from("video_likes")
    .select("id", { count: "exact", head: false })
    .eq("video_id", videoId);
  if (res.error) throw res.error;
  return (res.count ?? 0) as number;
}

export async function isLiked(videoId: string): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return false;
  const { data, error } = await supabase
    .from("video_likes")
    .select("id")
    .eq("video_id", videoId)
    .eq("user_id", user.id)
    .limit(1);
  if (error) throw error;
  return !!(data && data.length > 0);
}

export async function likeVideo(videoId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("video_likes").insert({
    video_id: videoId,
    user_id: user.id,
  });
  // If unique violation happens, ignore it client-side
  if (error && !(error.details && (error.details as string).includes("already exists"))) throw error;
}

export async function unlikeVideo(videoId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("video_likes")
    .delete()
    .eq("video_id", videoId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export function useVideoLikes(videoId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const countQuery = useQuery(["video", videoId, "likes"], () => getLikeCount(videoId), {
    enabled: !!videoId,
  });

  const likedQuery = useQuery(
    ["video", videoId, "liked"],
    async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("video_likes")
        .select("id")
        .eq("video_id", videoId)
        .eq("user_id", user.id)
        .limit(1);
      if (error) throw error;
      return !!(data && data.length > 0);
    },
    { enabled: !!videoId },
  );

  const likeMutation = useMutation(() => likeVideo(videoId), {
    onSuccess: () => {
      queryClient.invalidateQueries(["video", videoId, "likes"]);
      queryClient.setQueryData(["video", videoId, "liked"], true);
    },
  });

  const unlikeMutation = useMutation(() => unlikeVideo(videoId), {
    onSuccess: () => {
      queryClient.invalidateQueries(["video", videoId, "likes"]);
      queryClient.setQueryData(["video", videoId, "liked"], false);
    },
  });

  return {
    likeCount: countQuery.data ?? 0,
    isLiked: likedQuery.data ?? false,
    likeVideo: () => likeMutation.mutateAsync(),
    unlikeVideo: () => unlikeMutation.mutateAsync(),
    liking: likeMutation.isLoading,
    unliking: unlikeMutation.isLoading,
    refresh: () => {
      queryClient.invalidateQueries(["video", videoId, "likes"]);
      queryClient.invalidateQueries(["video", videoId, "liked"]);
    },
  };
}
