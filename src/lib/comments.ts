import { supabase } from "@/integrations/supabase/client";

export type Comment = {
  id: string;
  user_id: string;
  video_id: string;
  text: string;
  created_at: string;
  creator?: {
    display_name: string;
    username: string | null;
  };
};

export async function fetchComments(videoId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id,user_id,video_id,text,created_at")
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch comments", error);
    return [];
  }
  const comments = (data ?? []) as Comment[];
  
  // Fetch creator profiles for all unique users
  const userIds = [...new Set(comments.map((c) => c.user_id).filter(Boolean))];
  const profilesMap = new Map<string, { display_name: string; username: string | null }>();
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id,display_name,username")
      .in("id", userIds);
    profilesData?.forEach((p: any) => {
      profilesMap.set(p.id, { display_name: p.display_name, username: p.username ?? null });
    });
  }
  
  return comments.map((c) => ({
    ...c,
    creator: profilesMap.get(c.user_id) || { display_name: "Anonymous", username: null },
  }));
}

export async function addComment(userId: string, videoId: string, text: string): Promise<Comment | null> {
  const { data, error } = await supabase
    .from("comments")
    .insert([{ user_id: userId, video_id: videoId, text: text.trim() }])
    .select()
    .single();
  if (error) {
    console.error("Failed to add comment", error);
    return null;
  }
  const comment = data as Comment;
  
  // Fetch creator profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,display_name,username")
    .eq("id", userId)
    .single();
  if (profile) {
    comment.creator = { display_name: profile.display_name, username: profile.username ?? null };
  }
  
  return comment;
}

export async function deleteComment(commentId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) {
    console.error("Failed to delete comment", error);
    return false;
  }
  return true;
}
