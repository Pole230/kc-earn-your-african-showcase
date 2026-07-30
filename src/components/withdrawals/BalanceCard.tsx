import React from "react";

export function BalanceCard({ label, value, loading }: { label: string; value: number | string; loading?: boolean }) {
  const fmt = (v: number | string) => {
    try {
      const n = typeof v === "number" ? v : Number(v ?? 0);
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
    } catch {
      return String(value);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{loading ? "…" : fmt(value)}</p>
    </div>
  );
}
export default BalanceCard;
