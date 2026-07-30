import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CreatorEarning } from "@/hooks/useCreatorEarnings";

export type TopVideo = {
  id: string;
  title: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  thumbnail_path: string | null;
};

export async function getTotalViews(): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("videos").select("views_count").eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []).reduce((s: number, r: any) => s + Number(r.views_count ?? 0), 0);
}

export async function getTotalLikes(): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  // get user's video ids
  const { data: vids, error: verror } = await supabase.from("videos").select("id").eq("user_id", user.id);
  if (verror) throw verror;
  const ids = (vids ?? []).map((v: any) => v.id);
  if (ids.length === 0) return 0;

  const { data, error } = await supabase.from("video_likes").select("id").in("video_id", ids);
  if (error) throw error;
  return (data ?? []).length;
}

export async function getTotalComments(): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data: vids, error: verror } = await supabase.from("videos").select("id").eq("user_id", user.id);
  if (verror) throw verror;
  const ids = (vids ?? []).map((v: any) => v.id);
  if (ids.length === 0) return 0;

  const { data, error } = await supabase.from("video_comments").select("id").in("video_id", ids);
  if (error) throw error;
  return (data ?? []).length;
}

export async function getFollowerGrowth(days = 30): Promise<{ totalFollowers: number; periodCount: number; prevPeriodCount: number; percentChange: number }> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  // total followers
  const { data: totalData, error: totalError } = await supabase.from("follows").select("id").eq("following_id", user.id);
  if (totalError) throw totalError;
  const totalFollowers = (totalData ?? []).length;

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const prevStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000).toISOString();

  const { data: periodData, error: pErr } = await supabase
    .from("follows")
    .select("id,created_at")
    .eq("following_id", user.id)
    .gte("created_at", periodStart);
  if (pErr) throw pErr;
  const periodCount = (periodData ?? []).length;

  const { data: prevData, error: prevErr } = await supabase
    .from("follows")
    .select("id,created_at")
    .eq("following_id", user.id)
    .gte("created_at", prevStart)
    .lt("created_at", periodStart);
  if (prevErr) throw prevErr;
  const prevPeriodCount = (prevData ?? []).length;

  const percentChange = prevPeriodCount === 0 ? (periodCount === 0 ? 0 : 100) : ((periodCount - prevPeriodCount) / prevPeriodCount) * 100;
  return { totalFollowers, periodCount, prevPeriodCount, percentChange };
}

export async function getTopPerformingVideos(limit = 5): Promise<TopVideo[]> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data: vids, error: verror } = await supabase
    .from("videos")
    .select("id,title,views_count,thumbnail_path")
    .eq("user_id", user.id)
    .order("views_count", { ascending: false })
    .limit(limit);
  if (verror) throw verror;
  const ids = (vids ?? []).map((v: any) => v.id);

  let likesMap = new Map<string, number>();
  let commentsMap = new Map<string, number>();

  if (ids.length > 0) {
    const { data: likesData, error: lerr } = await supabase.from("video_likes").select("video_id").in("video_id", ids);
    if (lerr) throw lerr;
    (likesData ?? []).forEach((l: any) => likesMap.set(l.video_id, (likesMap.get(l.video_id) ?? 0) + 1));

    const { data: commentsData, error: cerr } = await supabase.from("video_comments").select("video_id").in("video_id", ids);
    if (cerr) throw cerr;
    (commentsData ?? []).forEach((c: any) => commentsMap.set(c.video_id, (commentsMap.get(c.video_id) ?? 0) + 1));
  }

  return (vids ?? []).map((v: any) => ({
    id: v.id,
    title: v.title,
    views_count: v.views_count ?? 0,
    likes_count: likesMap.get(v.id) ?? 0,
    comments_count: commentsMap.get(v.id) ?? 0,
    thumbnail_path: v.thumbnail_path ?? null,
  }));
}

export async function getAnalyticsSummary() {
  const [earnings, views, likes, comments, followers, topVideos] = await Promise.all([
    // use server-side endpoints via the client hooks — get totals from creator_earnings
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from<CreatorEarning>("creator_earnings").select("amount");
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    })(),
    getTotalViews(),
    getTotalLikes(),
    getTotalComments(),
    getFollowerGrowth(),
    getTopPerformingVideos(),
  ]);

  return {
    totalEarnings: earnings,
    totalViews: views,
    totalLikes: likes,
    totalComments: comments,
    followers,
    topVideos,
  };
}

export function useCreatorAnalytics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const earningsQuery = useQuery({
    queryKey: ["creator", "analytics", "earnings"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("creator_earnings").select("amount");
      if (error) throw error;
      return ((data ?? []) as { amount: number | string }[]).reduce(
        (s, r) => s + Number(r.amount ?? 0),
        0,
      );
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const viewsQuery = useQuery({ queryKey: ["creator", "analytics", "views"], queryFn: () => getTotalViews(), enabled: !!user });
  const likesQuery = useQuery({ queryKey: ["creator", "analytics", "likes"], queryFn: () => getTotalLikes(), enabled: !!user });
  const commentsQuery = useQuery({ queryKey: ["creator", "analytics", "comments"], queryFn: () => getTotalComments(), enabled: !!user });
  const followersQuery = useQuery({ queryKey: ["creator", "analytics", "followers"], queryFn: () => getFollowerGrowth(), enabled: !!user });
  const topQuery = useQuery({ queryKey: ["creator", "analytics", "top"], queryFn: () => getTopPerformingVideos(), enabled: !!user });

  return {
    totalEarnings: earningsQuery.data ?? 0,
    totalEarningsLoading: earningsQuery.isLoading,
    totalViews: viewsQuery.data ?? 0,
    totalViewsLoading: viewsQuery.isLoading,
    totalLikes: likesQuery.data ?? 0,
    totalLikesLoading: likesQuery.isLoading,
    totalComments: commentsQuery.data ?? 0,
    totalCommentsLoading: commentsQuery.isLoading,
    followers: followersQuery.data ?? { totalFollowers: 0, periodCount: 0, prevPeriodCount: 0, percentChange: 0 },
    followersLoading: followersQuery.isLoading,
    topVideos: topQuery.data ?? [],
    topLoading: topQuery.isLoading,
    refresh: () => {
      queryClient.invalidateQueries(["creator", "analytics"]);
    },
  };
}
