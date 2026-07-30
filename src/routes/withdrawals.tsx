import { createFileRoute, Link } from "@tanstack/react-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { useCreatorEarnings } from "@/hooks/useCreatorEarnings";
import { BalanceCard } from "@/components/withdrawals/BalanceCard";
import { BankAccounts } from "@/components/withdrawals/BankAccounts";
import { WithdrawalForm } from "@/components/withdrawals/WithdrawalForm";
import { WithdrawalHistory } from "@/components/withdrawals/WithdrawalHistory";

export const Route = createFileRoute("/withdrawals")({
  head: () => ({ meta: [{ title: "Withdrawals — KC Earn" }] }),
  component: WithdrawalsPage,
});

export default function WithdrawalsPage() {
  const w = useWithdrawals();
  const earnings = useCreatorEarnings();

  return (
    <div className="px-5 pb-6">
      <ScreenHeader title="Withdrawals" subtitle="Manage your payouts" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BalanceCard label="Available Balance" value={w.available} loading={w.availableLoading} />
        <BalanceCard
          label="Pending Balance"
          value={Number((w.history ?? []).filter((h) => h.status === "pending").reduce((s, r) => s + Number(r.amount || 0), 0))}
          loading={w.historyLoading}
        />
        <BalanceCard label="Lifetime Earnings" value={earnings.total ?? 0} loading={earnings.totalLoading} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">Bank Accounts</h3>
          <BankAccounts />
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">Request a Withdrawal</h3>
          <WithdrawalForm />
        </div>
      </div>

      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold">Withdrawal History</h3>
        <WithdrawalHistory />
      </section>

      <div className="mt-8 text-center">
        <Link to="/" className="text-sm text-muted-foreground">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
