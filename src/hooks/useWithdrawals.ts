import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BankAccount = {
  id: string;
  creator_id: string;
  provider: string;
  external_id: string | null;
  account_holder: string | null;
  account_last4: string | null;
  account_mask: string | null;
  metadata: Record<string, unknown> | null;
  verified: boolean;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  creator_id: string;
  bank_account_id: string | null;
  amount: string; // numeric comes back as string from Postgres via PostgREST
  fee: string;
  net_amount: string;
  status: "pending" | "approved" | "processing" | "paid" | "rejected" | "cancelled";
  request_note: string | null;
  admin_note: string | null;
  tx_reference: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  metadata: Record<string, unknown> | null;
};

export type NewBankAccountInput = {
  provider: string;
  external_id?: string | null;
  account_holder?: string | null;
  account_last4?: string | null;
  account_mask?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RequestWithdrawalInput = {
  bank_account_id: string;
  amount: number; // client supplies number; RPC will validate
  request_note?: string | null;
};

// Low-level client functions
async function rpcGetAvailableBalance() {
  const { data, error } = await supabase.rpc("get_available_balance");
  if (error) throw error;
  // Expect the RPC to return a single numeric value (string) or object
  // Supabase RPC returns array when returning setof; we'll accept both shapes
  if (data == null) return 0;
  // If RPC returns [{ available: '123.45' }] or just { available: '123.45' } or '123.45'
  if (Array.isArray(data)) {
    const first = data[0] as any;
    if (first && typeof first.available !== "undefined") return Number(first.available);
    if (typeof first === "number") return Number(first);
    if (typeof first === "string") return Number(first);
  }
  if (typeof data === "object" && data !== null && (data as any).available !== undefined) return Number((data as any).available);
  if (typeof data === "string" || typeof data === "number") return Number(data);
  return 0;
}

async function rpcRequestWithdrawal(input: RequestWithdrawalInput) {
  // Call server-side RPC which validates auth, balance, min, duplicates, creates withdrawal, audit, and notification
  const payload = {
    bank_account_id: input.bank_account_id,
    amount: input.amount,
    request_note: input.request_note ?? null,
  };
  const { data, error } = await supabase.rpc("request_withdrawal", payload);
  if (error) throw error;
  // Expect the RPC to return the created withdrawal row
  return data as unknown as Withdrawal;
}

async function fetchBankAccounts() {
  const { data, error } = await supabase.from<BankAccount>("bank_accounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BankAccount[];
}

async function addBankAccount(input: NewBankAccountInput) {
  const { data, error } = await supabase.from<BankAccount>("bank_accounts").insert([
    {
      provider: input.provider,
      external_id: input.external_id ?? null,
      account_holder: input.account_holder ?? null,
      account_last4: input.account_last4 ?? null,
      account_mask: input.account_mask ?? null,
      metadata: input.metadata ?? null,
    },
  ]);
  if (error) throw error;
  return (data ?? [])[0] as BankAccount;
}

async function deleteBankAccount(id: string) {
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) throw error;
  return true;
}

async function fetchWithdrawalHistory(page = 1, perPage = 20) {
  const from = (page - 1) * perPage;
  const to = page * perPage - 1;
  const { data, error } = await supabase
    .from<Withdrawal>("withdrawals")
    .select(
      `id,creator_id,bank_account_id,amount,fee,net_amount,status,request_note,admin_note,tx_reference,requested_at,processed_at,processed_by,metadata`,
    )
    .order("requested_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []) as Withdrawal[];
}

async function cancelWithdrawalRPC(withdrawalId: string) {
  // We'll use a direct update here — RLS allows creators to set status to 'cancelled' on their own pending withdrawals
  const { data, error } = await supabase
    .from<Withdrawal>("withdrawals")
    .update({ status: "cancelled" }, { returning: "representation" })
    .eq("id", withdrawalId)
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? [])[0] as Withdrawal;
}

// React Query hook
export function useWithdrawals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const availableQuery = useQuery(["withdrawals", "available"], () => rpcGetAvailableBalance(), {
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const bankAccountsQuery = useQuery(["withdrawals", "bank_accounts"], () => fetchBankAccounts(), {
    enabled: !!user,
  });

  const historyQuery = useQuery(
    ["withdrawals", "history", { page: 1 }],
    () => fetchWithdrawalHistory(1, 20),
    {
      enabled: !!user,
    },
  );

  const addBankAccountMutation = useMutation((input: NewBankAccountInput) => addBankAccount(input), {
    onSuccess: () => {
      queryClient.invalidateQueries(["withdrawals", "bank_accounts"]);
    },
  });

  const deleteBankAccountMutation = useMutation((id: string) => deleteBankAccount(id), {
    onSuccess: () => {
      queryClient.invalidateQueries(["withdrawals", "bank_accounts"]);
    },
  });

  const requestWithdrawalMutation = useMutation((input: RequestWithdrawalInput) => rpcRequestWithdrawal(input), {
    onSuccess: () => {
      queryClient.invalidateQueries(["withdrawals", "available"]);
      queryClient.invalidateQueries(["withdrawals", "history"]);
      queryClient.invalidateQueries(["withdrawals", "bank_accounts"]);
      queryClient.invalidateQueries(["creator", "earnings", "total"]);
      queryClient.invalidateQueries(["creator", "earnings", "monthly"]);
    },
  });

  const cancelWithdrawalMutation = useMutation((id: string) => cancelWithdrawalRPC(id), {
    onSuccess: () => {
      queryClient.invalidateQueries(["withdrawals", "available"]);
      queryClient.invalidateQueries(["withdrawals", "history"]);
    },
  });

  return {
    // data
    available: availableQuery.data ?? 0,
    availableLoading: availableQuery.isLoading,
    bankAccounts: bankAccountsQuery.data ?? [],
    bankAccountsLoading: bankAccountsQuery.isLoading,
    history: historyQuery.data ?? [],
    historyLoading: historyQuery.isLoading,

    // mutations
    addBankAccount: (input: NewBankAccountInput) => addBankAccountMutation.mutateAsync(input),
    addingBankAccount: addBankAccountMutation.isLoading,
    deleteBankAccount: (id: string) => deleteBankAccountMutation.mutateAsync(id),
    deletingBankAccount: deleteBankAccountMutation.isLoading,

    requestWithdrawal: (input: RequestWithdrawalInput) => requestWithdrawalMutation.mutateAsync(input),
    requestingWithdrawal: requestWithdrawalMutation.isLoading,

    cancelWithdrawal: (id: string) => cancelWithdrawalMutation.mutateAsync(id),
    cancellingWithdrawal: cancelWithdrawalMutation.isLoading,

    // helpers
    refresh: () => {
      queryClient.invalidateQueries(["withdrawals"]);
    },
  };
}
