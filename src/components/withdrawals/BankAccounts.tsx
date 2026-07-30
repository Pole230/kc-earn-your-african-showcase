import React, { useState } from "react";
import { useWithdrawals, NewBankAccountInput } from "@/hooks/useWithdrawals";
import { Plus, Trash, Edit, Check } from "lucide-react";
import { toast } from "sonner";

function VerifiedBadge() {
  return <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Verified</span>;
}

export function BankAccounts() {
  const w = useWithdrawals();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewBankAccountInput>({ provider: "manual" });

  function openAdd() {
    setForm({ provider: "manual", account_holder: "", account_last4: "", account_mask: "" });
    setEditingId(null);
    setAdding(true);
  }

  function openEdit(accountId: string) {
    const acc = w.bankAccounts.find((b) => b.id === accountId);
    if (!acc) return;
    setForm({
      provider: acc.provider,
      external_id: acc.external_id ?? null,
      account_holder: acc.account_holder ?? null,
      account_last4: acc.account_last4 ?? null,
      account_mask: acc.account_mask ?? null,
      metadata: acc.metadata ?? null,
    });
    setEditingId(accountId);
    setAdding(true);
  }

  async function save() {
    try {
      if (!form.provider) throw new Error("Provider required");
      const newAcc = await w.addBankAccount(form);
      toast.success("Bank account saved");
      // If editing, remove the old one to simulate edit (hook does not expose update)
      if (editingId) {
        try {
          await w.deleteBankAccount(editingId);
        } catch (e) {
          // ignore delete failure but log
          console.error("delete old bank account after edit failed", e);
        }
      }
      setAdding(false);
      setEditingId(null);
    } catch (err: any) {
      toast.error("Failed to save bank account", { description: err?.message ?? String(err) });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this bank account? This action cannot be undone.")) return;
    try {
      await w.deleteBankAccount(id);
      toast.success("Bank account deleted");
    } catch (err: any) {
      toast.error("Failed to delete bank account", { description: err?.message ?? String(err) });
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Manage your bank accounts</div>
        <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-sm" onClick={openAdd}>
          <Plus className="size-4" /> Add
        </button>
      </div>

      <div className="space-y-3">
        {w.bankAccountsLoading ? (
          <div className="rounded-2xl border border-border bg-surface p-4">Loading accounts…</div>
        ) : w.bankAccounts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">No bank accounts yet</div>
        ) : (
          w.bankAccounts.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
              <div>
                <div className="text-sm font-semibold">{b.account_holder ?? "Bank account"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{b.provider} · ****{b.account_last4 ?? "----"}</div>
              </div>
              <div className="flex items-center gap-2">
                {b.verified ? <VerifiedBadge /> : null}
                <button aria-label="Edit" onClick={() => openEdit(b.id)} className="text-muted-foreground hover:text-foreground">
                  <Edit className="size-4" />
                </button>
                <button aria-label="Delete" onClick={() => remove(b.id)} className="text-red-500 hover:text-red-600">
                  <Trash className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit form (simple inline panel) */}
      {adding ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 text-sm font-semibold">{editingId ? "Edit bank account" : "Add bank account"}</div>

          <label className="mb-1 block text-xs font-medium">Account holder</label>
          <input value={form.account_holder ?? ""} onChange={(e) => setForm((s) => ({ ...s, account_holder: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />

          <label className="mt-3 mb-1 block text-xs font-medium">Last 4 digits</label>
          <input value={form.account_last4 ?? ""} onChange={(e) => setForm((s) => ({ ...s, account_last4: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />

          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => save()} className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm text-white">
              <Check className="size-4" /> Save
            </button>
            <button onClick={() => { setAdding(false); setEditingId(null); }} className="text-sm text-muted-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BankAccounts;
