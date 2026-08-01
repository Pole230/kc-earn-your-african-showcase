import { supabase } from "@/integrations/supabase/client";

export type Like = {
  id: string;
  user_id: string;
  video_id: string;
  created_at: string;
};

export async function fetchLikesCount(videoId: string): Promise<number> {
  const { count, error } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("video_id", videoId);
  if (error) {
    console.error("Failed to fetch likes count", error);
    return 0;
  }
  return count ?? 0;
}

export async function fetchUserLike(userId: string, videoId: string): Promise<Like | null> {
  const { data, error } = await supabase
    .from("likes")
    .select("*")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch user like", error);
    return null;
  }
  return data as Like | null;
}

export async function likeVideo(userId: string, videoId: string): Promise<Like | null> {
  const existing = await fetchUserLike(userId, videoId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("likes")
    .insert([{ user_id: userId, video_id: videoId }])
    .select()
    .single();
  if (error) {
    console.error("Failed to like video", error);
    return null;
  }
  return data as Like;
}

export async function unlikeVideo(userId: string, videoId: string): Promise<boolean> {
  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("user_id", userId)
    .eq("video_id", videoId);
  if (error) {
    console.error("Failed to unlike video", error);
    return false;
  }
  return true;
}
