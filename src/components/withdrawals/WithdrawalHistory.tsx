import React from "react";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { timeAgo } from "@/lib/videos";
import { toast } from "sonner";

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-800",
  approved: "bg-blue-50 text-blue-800",
  processing: "bg-indigo-50 text-indigo-800",
  paid: "bg-green-50 text-green-800",
  rejected: "bg-red-50 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export function WithdrawalHistory() {
  const w = useWithdrawals();

  async function onCancel(id: string) {
    if (!confirm("Cancel this pending withdrawal?")) return;
    try {
      await w.cancelWithdrawal(id);
      toast.success("Withdrawal cancelled");
    } catch (err: any) {
      toast.error("Failed to cancel withdrawal", { description: err?.message ?? String(err) });
    }
  }

  if (w.historyLoading) {
    return <div className="rounded-2xl border border-border bg-surface p-4">Loading withdrawal history…</div>;
  }

  if (!w.history || w.history.length === 0) {
    return <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">No withdrawals yet</div>;
  }

  return (
    <div className="space-y-3">
      {w.history.map((row) => (
        <div key={row.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <div className="text-sm font-semibold">₦{Number(row.amount).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">fee ₦{Number(row.fee).toLocaleString()}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{row.request_note ?? ""}</div>
            <div className="mt-1 text-xs text-muted-foreground">Ref: {row.tx_reference ?? "—"}</div>
          </div>
          <div className="flex flex-col items-end">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[row.status] ?? "bg-gray-100 text-gray-800"}`}>
              {row.status}
            </span>
            <div className="mt-2 text-xs text-muted-foreground">{new Date(row.requested_at).toLocaleString()}</div>
            {row.status === "pending" ? (
              <button onClick={() => onCancel(row.id)} className="mt-2 text-sm text-red-500">
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default WithdrawalHistory;
