import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CreatorEarning = {
  id: string;
  creator_id: string;
  video_id: string;
  earning_type: string;
  amount: number;
  status: string;
  created_at: string;
};

export async function getTotalEarnings(): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from<CreatorEarning>("creator_earnings").select("amount");
  if (error) throw error;

  return (data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
}

export async function getVideoEarnings(videoId: string): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from<CreatorEarning>("creator_earnings")
    .select("amount")
    .eq("video_id", videoId);
  if (error) throw error;

  return (data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
}

export async function getMonthlyEarnings(days = 30): Promise<number> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from<CreatorEarning>("creator_earnings")
    .select("amount")
    .gte("created_at", cutoff);
  if (error) throw error;

  return (data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
}

export async function getRecentEarnings(limit = 20): Promise<CreatorEarning[]> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from<CreatorEarning>("creator_earnings")
    .select("id,creator_id,video_id,earning_type,amount,status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CreatorEarning[];
}

export function useCreatorEarnings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const totalQuery = useQuery(["creator", "earnings", "total"], () => getTotalEarnings(), {
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const monthlyQuery = useQuery(["creator", "earnings", "monthly"], () => getMonthlyEarnings(), {
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const recentQuery = useQuery(["creator", "earnings", "recent"], () => getRecentEarnings(), {
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const videoEarnings = {
    get: (videoId: string) => queryClient.fetchQuery(["creator", "earnings", "video", videoId], () => getVideoEarnings(videoId)),
  };

  return {
    total: totalQuery.data ?? 0,
    totalLoading: totalQuery.isLoading,
    monthly: monthlyQuery.data ?? 0,
    monthlyLoading: monthlyQuery.isLoading,
    recent: recentQuery.data ?? [],
    recentLoading: recentQuery.isLoading,
    videoEarnings,
    refresh: () => {
      queryClient.invalidateQueries(["creator", "earnings"]);
    },
  };
}
