import { supabase } from "@/integrations/supabase/client";

export type Wallet = {
  user_id: string;
  available_balance: number;
  pending_balance: number;
  promotional_bonus_balance: number;
  referral_bonus_locked: number;
  referral_bonus_unlocked: number;
  real_earnings_balance: number;
  lifetime_earned: number;
  currency: string;
};

export type Earning = {
  id: string;
  amount: number;
  source: "views" | "engagement" | "bonus" | "referral";
  note: string | null;
  video_id: string | null;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  amount: number;
  method: string;
  destination: string;
  status: "pending" | "processing" | "paid" | "rejected";
  created_at: string;
};

export type VerificationStatus = {
  phone_verified_at: string | null;
  email_verified_at: string | null;
};

export type RewardConfig = {
  signup_bonus: number;
  referral_target: number;
  referral_reward: number;
  minimum_withdrawal: number;
  withdrawal_fee: number;
};

export const PAYOUT_METHODS = ["Mobile Money", "Bank Transfer", "PayPal"] as const;

function num(value: number | string | null): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function fetchWallet(userId: string): Promise<Wallet> {
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{ data: Partial<Wallet> | null; error: Error | null }>;
        };
      };
    };
  };
  const { data, error } = await client
    .from("wallets")
    .select(
      "user_id,available_balance,pending_balance,promotional_bonus_balance,referral_bonus_locked,referral_bonus_unlocked,real_earnings_balance,lifetime_earned,currency",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    user_id: userId,
    available_balance: num(data?.available_balance ?? 0),
    pending_balance: num(data?.pending_balance ?? 0),
    promotional_bonus_balance: num(data?.promotional_bonus_balance ?? 0),
    referral_bonus_locked: num(data?.referral_bonus_locked ?? 0),
    referral_bonus_unlocked: num(data?.referral_bonus_unlocked ?? 0),
    real_earnings_balance: num(data?.real_earnings_balance ?? data?.available_balance ?? 0),
    lifetime_earned: num(data?.lifetime_earned ?? 0),
    currency: data?.currency ?? "USD",
  };
}

export async function fetchEarnings(userId: string): Promise<Earning[]> {
  const { data, error } = await supabase
    .from("earnings")
    .select("id,amount,source,note,video_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    amount: num(row.amount),
    source: row.source,
    note: row.note,
    video_id: row.video_id,
    created_at: row.created_at,
  }));
}

export async function fetchWithdrawals(userId: string): Promise<Withdrawal[]> {
  const { data, error } = await supabase
    .from("withdrawals")
    .select("id,amount,method,destination,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    amount: num(row.amount),
    method: row.method,
    destination: row.destination,
    status: row.status,
    created_at: row.created_at,
  }));
}

export async function requestWithdrawal(input: {
  amount: number;
  method: string;
  destination: string;
}) {
  const { data, error } = await supabase.rpc("request_withdrawal", {
    _amount: input.amount,
    _method: input.method,
    _destination: input.destination,
  });
  if (error) throw error;
  return data;
}

export async function fetchVerificationStatus(): Promise<VerificationStatus> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/verification", {
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  if (!response.ok) throw new Error("Could not load verification status");
  return response.json();
}

export async function fetchRewardConfig(): Promise<RewardConfig> {
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: boolean,
        ) => {
          maybeSingle: () => Promise<{ data: RewardConfig | null; error: Error | null }>;
        };
      };
    };
  };
  const { data, error } = await client
    .from("platform_reward_config")
    .select("signup_bonus,referral_target,referral_reward,minimum_withdrawal,withdrawal_fee")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Could not load reward configuration");
  return data;
}

export function formatMoney(amount: number, currency = "USD") {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}
