import { supabase } from "@/integrations/supabase/client";

/* ---------------- view context (hashed IP + country) ---------------- */

export type ViewContext = { ipHash: string | null; country: string | null };

let contextPromise: Promise<ViewContext> | null = null;

export function getViewContext(): Promise<ViewContext> {
  if (typeof window === "undefined") return Promise.resolve({ ipHash: null, country: null });
  if (!contextPromise) {
    contextPromise = fetch("/api/public/view-context")
      .then((r) => (r.ok ? (r.json() as Promise<ViewContext>) : { ipHash: null, country: null }))
      .catch(() => ({ ipHash: null, country: null }));
  }
  return contextPromise;
}

const SESSION_STORAGE_KEY = "kc-earn:view-session";

export function getSessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let key = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!key) {
      key = crypto.randomUUID();
      window.localStorage.setItem(SESSION_STORAGE_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

export function detectDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

export type RecordViewResult = { valid: boolean; earned: number; reason: string | null };

export async function recordVideoView(input: {
  videoId: string;
  watchSeconds: number;
  percentWatched: number;
}): Promise<RecordViewResult | null> {
  if (!input.videoId || input.watchSeconds <= 0) return null;
  const ctx = await getViewContext();
  const { data, error } = await supabase.rpc("record_video_view", {
    _video_id: input.videoId,
    _watch_seconds: Math.round(input.watchSeconds),
    _percent_watched: Math.max(0, Math.min(100, Number(input.percentWatched.toFixed(2)))),
    _device: detectDevice(),
    _country: ctx.country,
    _session_key: getSessionKey(),
    _ip_hash: ctx.ipHash,
  });
  if (error) {
    console.error("record_video_view failed", error);
    return null;
  }
  const row = data as { valid?: boolean; earned?: number | string; reason?: string | null } | null;
  return {
    valid: Boolean(row?.valid),
    earned: Number(row?.earned ?? 0),
    reason: row?.reason ?? null,
  };
}

/* ---------------- notifications ---------------- */

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,kind,title,body,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

/* ---------------- rewards ---------------- */

export type RewardClaim = {
  id: string;
  kind: string;
  reference: string;
  amount: number;
  created_at: string;
};

export async function claimDailyLogin() {
  const { data, error } = await supabase.rpc("claim_daily_login");
  if (error) throw error;
  const row = data as { granted?: boolean; amount?: number | string } | null;
  return { granted: Boolean(row?.granted), amount: Number(row?.amount ?? 0) };
}

export async function fetchRewards(limit = 25): Promise<RewardClaim[]> {
  const { data, error } = await supabase
    .from("reward_claims")
    .select("id,kind,reference,amount,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/* ---------------- payout config ---------------- */

export type PayoutConfig = {
  rate_per_view: number;
  min_watch_seconds: number;
  min_watch_percent: number;
  dedup_window_minutes: number;
  daily_creator_limit: number;
  per_viewer_daily_limit: number;
  min_withdrawal: number;
  currency: string;
};

export async function fetchPayoutConfig(): Promise<PayoutConfig | null> {
  const { data, error } = await supabase
    .from("payout_config")
    .select(
      "rate_per_view,min_watch_seconds,min_watch_percent,dedup_window_minutes,daily_creator_limit,per_viewer_daily_limit,min_withdrawal,currency",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    rate_per_view: Number(data.rate_per_view),
    min_watch_seconds: data.min_watch_seconds,
    min_watch_percent: Number(data.min_watch_percent),
    dedup_window_minutes: data.dedup_window_minutes,
    daily_creator_limit: Number(data.daily_creator_limit),
    per_viewer_daily_limit: Number(data.per_viewer_daily_limit),
    min_withdrawal: Number(data.min_withdrawal),
    currency: data.currency,
  };
}

/* ---------------- analytics ---------------- */

export type CreatorAnalytics = {
  videos: number;
  views: number;
  watch_seconds: number;
  avg_percent_watched: number;
  earnings: number;
  countries: { country: string; views: number }[];
  daily: { day: string; views: number; earned: number }[];
};

export async function fetchCreatorAnalytics(userId?: string): Promise<CreatorAnalytics> {
  const { data, error } = await supabase.rpc("creator_analytics", { _user_id: userId ?? undefined });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    videos: Number(raw.videos ?? 0),
    views: Number(raw.views ?? 0),
    watch_seconds: Number(raw.watch_seconds ?? 0),
    avg_percent_watched: Number(raw.avg_percent_watched ?? 0),
    earnings: Number(raw.earnings ?? 0),
    countries: ((raw.countries as { country: string; views: number }[]) ?? []).map((c) => ({
      country: c.country,
      views: Number(c.views),
    })),
    daily: ((raw.daily as { day: string; views: number; earned: number }[]) ?? []).map((d) => ({
      day: d.day,
      views: Number(d.views),
      earned: Number(d.earned),
    })),
  };
}
