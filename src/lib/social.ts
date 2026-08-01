import { supabase } from "@/integrations/supabase/client";

export async function getLikesCount(videoId: string): Promise<number> {
  const { count, error } = await supabase
    .from("likes")
    .select("id", { count: "exact", head: false })
    .eq("video_id", videoId);

  if (error) {
    console.error("getLikesCount error", error);
    return 0;
  }

  return typeof count === "number" ? count : 0;
}

export async function hasUserLiked(videoId: string): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from("likes")
      .select("id")
      .eq("video_id", videoId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("hasUserLiked error", error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function toggleLike(videoId: string): Promise<{ liked: boolean; count: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  // Check existing like
  const { data: existing, error: selectError } = await supabase
    .from("likes")
    .select("id")
    .eq("video_id", videoId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error("toggleLike select error", selectError);
    throw selectError;
  }

  if (existing && existing.id) {
    // Delete
    const { error: delError } = await supabase.from("likes").delete().eq("id", existing.id);
    if (delError) {
      console.error("toggleLike delete error", delError);
      throw delError;
    }
  } else {
    const { error: insertError } = await supabase.from("likes").insert([{ video_id: videoId, user_id: userId }]);
    if (insertError) {
      console.error("toggleLike insert error", insertError);
      throw insertError;
    }
  }

  const count = await getLikesCount(videoId);
  return { liked: !existing, count };
}
