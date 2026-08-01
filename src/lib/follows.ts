import { supabase } from "@/integrations/supabase/client";

export type Follow = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

export async function fetchFollowStatus(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch follow status", error);
    return false;
  }
  return !!data;
}

export async function fetchFollowersCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);
  if (error) {
    console.error("Failed to fetch followers count", error);
    return 0;
  }
  return count ?? 0;
}

export async function fetchFollowingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);
  if (error) {
    console.error("Failed to fetch following count", error);
    return 0;
  }
  return count ?? 0;
}

export async function followUser(followerId: string, followingId: string): Promise<Follow | null> {
  if (followerId === followingId) {
    console.error("Cannot follow yourself");
    return null;
  }
  
  const isFollowing = await fetchFollowStatus(followerId, followingId);
  if (isFollowing) return null;

  const { data, error } = await supabase
    .from("follows")
    .insert([{ follower_id: followerId, following_id: followingId }])
    .select()
    .single();
  if (error) {
    console.error("Failed to follow user", error);
    return null;
  }
  return data as Follow;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<boolean> {
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
  if (error) {
    console.error("Failed to unfollow user", error);
    return false;
  }
  return true;
}
