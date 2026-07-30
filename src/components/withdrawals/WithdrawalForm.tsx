import React, { useMemo, useState } from "react";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { useCreatorEarnings } from "@/hooks/useCreatorEarnings";
import { toast } from "sonner";

const MIN_WITHDRAWAL = 1000; // ₦1,000 per product decision
const DEFAULT_FEE = 0; // currently 0; displayed to user

function formatCurrency(n: number) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `₦${n.toFixed(2)}`;
  }
}

export function WithdrawalForm() {
  const w = useWithdrawals();
  const earnings = useCreatorEarnings();

  const [bankId, setBankId] = useState<string | null>(() => (w.bankAccounts[0]?.id ?? null));
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Derived values
  const available = Number(w.available ?? 0);
  const parsedAmount = Number(amount || 0);
  const fee = DEFAULT_FEE;
  const net = parsedAmount > 0 ? parsedAmount - fee : 0;

  const canSubmit = useMemo(() => {
    if (!bankId) return false;
    if (!parsedAmount || parsedAmount <= 0) return false;
    if (parsedAmount > available) return false;
    if (parsedAmount < MIN_WITHDRAWAL) return false;
    return true;
  }, [bankId, parsedAmount, available]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) {
      toast.error("Please check the form. Amount must meet the requirements.");
      return;
    }
    try {
      await w.requestWithdrawal({ bank_account_id: bankId!, amount: parsedAmount, request_note: note || null });
      toast.success("Withdrawal requested");
      setAmount("");
      setNote("");
    } catch (err: any) {
      toast.error("Failed to request withdrawal", { description: err?.message ?? String(err) });
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 text-xs text-muted-foreground">Select bank account</div>
      <select className="w-full rounded-md border px-3 py-2 text-sm" value={bankId ?? ""} onChange={(e) => setBankId(e.target.value || null)}>
        <option value="">Choose account</option>
        {w.bankAccounts.map((b) => (
          <option key={b.id} value={b.id}>
            {b.account_holder ?? "Account"} · ****{b.account_last4 ?? "----"} {b.verified ? " (verified)" : ""}
          </option>
        ))}
      </select>

      <label className="mt-3 mb-1 block text-xs font-medium">Amount</label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder={`Min ${formatCurrency(MIN_WITHDRAWAL)}`}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Minimum: {formatCurrency(MIN_WITHDRAWAL)} · Fee: {formatCurrency(fee)} · Net: {formatCurrency(net)}
      </p>

      <label className="mt-3 mb-1 block text-xs font-medium">Note (optional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={!canSubmit || w.requestingWithdrawal} className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          {w.requestingWithdrawal ? "Requesting…" : "Request Withdrawal"}
        </button>
        <button type="button" onClick={() => { setAmount(""); setNote(""); }} className="text-sm text-muted-foreground">Reset</button>
      </div>

      {/* Inline validation messages */}
      <div className="mt-3 text-sm">
        {!bankId ? <div className="text-xs text-red-500">Please choose a bank account.</div> : null}
        {parsedAmount <= 0 && amount ? <div className="text-xs text-red-500">Amount must be greater than zero.</div> : null}
        {parsedAmount > available ? <div className="text-xs text-red-500">Amount exceeds available balance.</div> : null}
        {parsedAmount > 0 && parsedAmount < MIN_WITHDRAWAL ? <div className="text-xs text-red-500">Minimum withdrawal is {formatCurrency(MIN_WITHDRAWAL)}</div> : null}
      </div>
    </form>
  );
}
export default WithdrawalForm;
