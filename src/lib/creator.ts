import { supabase } from "@/integrations/supabase/client";

export type Wallet = {
  user_id: string;
  available_balance: number;
  pending_balance: number;
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

export const PAYOUT_METHODS = ["Mobile Money", "Bank Transfer", "PayPal"] as const;

function num(value: number | string | null): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function fetchWallet(userId: string): Promise<Wallet> {
  const { data, error } = await supabase
    .from("wallets")
    .select("user_id,available_balance,pending_balance,lifetime_earned,currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    user_id: userId,
    available_balance: num(data?.available_balance ?? 0),
    pending_balance: num(data?.pending_balance ?? 0),
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

export function formatMoney(amount: number, currency = "USD") {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}
