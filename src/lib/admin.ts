import { supabase } from "@/integrations/supabase/client";
import type { CampaignStatus } from "@/lib/advertising";

export type PlatformStats = {
  creators: number;
  videos: number;
  valid_views: number;
  blocked_views: number;
  total_paid_out: number;
  pending_payouts: number;
  total_earnings: number;
  ad_revenue: number;
  active_campaigns: number;
  advertisers: number;
};

export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(raw[k] ?? 0);
  return {
    creators: n("creators"),
    videos: n("videos"),
    valid_views: n("valid_views"),
    blocked_views: n("blocked_views"),
    total_paid_out: n("total_paid_out"),
    pending_payouts: n("pending_payouts"),
    total_earnings: n("total_earnings"),
    ad_revenue: n("ad_revenue"),
    active_campaigns: n("active_campaigns"),
    advertisers: n("advertisers"),
  };
}

export type AdminWithdrawal = {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  destination: string;
  status: "pending" | "processing" | "paid" | "rejected";
  created_at: string;
};

export async function fetchAllWithdrawals(): Promise<AdminWithdrawal[]> {
  const { data, error } = await supabase
    .from("withdrawals")
    .select("id,user_id,amount,method,destination,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function updateWithdrawalStatus(
  id: string,
  status: "processing" | "paid" | "rejected",
  note?: string,
) {
  const { error } = await supabase.rpc("admin_update_withdrawal", {
    _withdrawal_id: id,
    _status: status,
    _note: note ?? undefined,
  });
  if (error) throw error;
}

export type FraudRow = {
  id: string;
  video_id: string;
  creator_id: string;
  viewer_id: string | null;
  country: string | null;
  device: string | null;
  fraud_reason: string | null;
  created_at: string;
};

export async function fetchFraudSignals(limit = 50): Promise<FraudRow[]> {
  const { data, error } = await supabase
    .from("video_views")
    .select("id,video_id,creator_id,viewer_id,country,device,fraud_reason,created_at")
    .eq("is_valid", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type AdminCreator = {
  id: string;
  display_name: string;
  username: string | null;
  location: string | null;
  created_at: string;
};

export async function fetchCreators(limit = 50): Promise<AdminCreator[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,username,location,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type AdminCampaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  budget: number;
  spent: number;
  advertiser_id: string;
  created_at: string;
};

export async function fetchAllCampaigns(): Promise<AdminCampaign[]> {
  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("id,name,status,budget,spent,advertiser_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    budget: Number(r.budget),
    spent: Number(r.spent),
    status: r.status as CampaignStatus,
  }));
}

export async function setCampaignStatus(id: string, status: CampaignStatus) {
  const { error } = await supabase.rpc("admin_set_campaign_status", {
    _campaign_id: id,
    _status: status,
  });
  if (error) throw error;
}

export async function updatePayoutConfig(patch: {
  rate_per_view?: number;
  min_watch_seconds?: number;
  min_watch_percent?: number;
  dedup_window_minutes?: number;
  daily_creator_limit?: number;
  per_viewer_daily_limit?: number;
  min_withdrawal?: number;
}) {
  const { error } = await supabase
    .from("payout_config")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw error;
}
