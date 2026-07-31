import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Eye, TrendingUp, Video, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyVideos, formatCount, timeAgo } from "@/lib/videos";
import {
  PAYOUT_METHODS,
  fetchEarnings,
  fetchWallet,
  fetchWithdrawals,
  formatMoney,
  requestWithdrawal,
} from "@/lib/creator";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Creator Dashboard — KC Earn" },
      {
        name: "description",
        content:
          "Track your KC Earn video performance, earnings balance and withdrawal requests in one creator dashboard.",
      },
      { property: "og:title", content: "Creator Dashboard — KC Earn" },
      {
        property: "og:description",
        content: "Views, earnings, wallet balance and payouts for KC Earn creators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-brand/15 text-brand",
  processing: "bg-brand/15 text-brand",
  paid: "bg-leaf/15 text-leaf",
  rejected: "bg-destructive/15 text-destructive",
};

function Dashboard() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="px-5">
        <ScreenHeader title="Creator dashboard" subtitle="Loading your creator data…" />
        <div className="h-40 animate-pulse rounded-3xl border border-border bg-surface" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-5">
        <ScreenHeader
          title="Creator dashboard"
          subtitle="Sign in to see your views, earnings and payouts."
        />
        <Link
          to="/auth"
          className="gradient-brand block rounded-2xl py-3 text-center text-sm font-bold text-brand-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return <DashboardContent userId={user.id} />;
}

function DashboardContent({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(PAYOUT_METHODS[0]);
  const [destination, setDestination] = useState("");

  const { data: wallet } = useQuery({
    queryKey: ["wallet", userId],
    queryFn: () => fetchWallet(userId),
  });
  const { data: earnings = [] } = useQuery({
    queryKey: ["earnings", userId],
    queryFn: () => fetchEarnings(userId),
  });
  const { data: withdrawals = [] } = useQuery({
    queryKey: ["withdrawals", userId],
    queryFn: () => fetchWithdrawals(userId),
  });
  const { data: videos = [] } = useQuery({
    queryKey: ["my-videos", userId],
    queryFn: () => fetchMyVideos(userId),
  });

  const currency = wallet?.currency ?? "USD";
  const totalViews = videos.reduce((sum, video) => sum + (video.views_count ?? 0), 0);

  const withdraw = useMutation({
    mutationFn: requestWithdrawal,
    onSuccess: async () => {
      setAmount("");
      setDestination("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet", userId] }),
        queryClient.invalidateQueries({ queryKey: ["withdrawals", userId] }),
      ]);
      toast.success("Withdrawal requested");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Could not request withdrawal";
      toast.error(message);
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!destination.trim()) {
      toast.error("Add your payout destination");
      return;
    }
    withdraw.mutate({ amount: value, method, destination: destination.trim() });
  }

  return (
    <div className="px-5 pb-4">
      <ScreenHeader
        title="Creator dashboard"
        subtitle="Your performance, earnings and payouts on KC Earn."
      />

      <section className="gradient-brand rounded-3xl p-5 text-brand-foreground">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
          <WalletIcon className="size-4" /> Wallet balance
        </p>
        <p className="mt-2 text-3xl font-bold">
          {formatMoney(wallet?.available_balance ?? 0, currency)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-black/15 p-3">
            <p className="text-xs opacity-80">Pending payouts</p>
            <p className="font-bold">{formatMoney(wallet?.pending_balance ?? 0, currency)}</p>
          </div>
          <div className="rounded-2xl bg-black/15 p-3">
            <p className="text-xs opacity-80">Lifetime earned</p>
            <p className="font-bold">{formatMoney(wallet?.lifetime_earned ?? 0, currency)}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3">
        {(
          [
            [Video, "Videos", String(videos.length)],
            [Eye, "Views", formatCount(totalViews)],
            [TrendingUp, "Entries", String(earnings.length)],
          ] as const
        ).map(([Icon, label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <Icon className="mx-auto size-4 text-brand" />
            <p className="mt-1 text-lg font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Earnings activity</h2>
        {earnings.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No earnings recorded yet. Keep uploading — earnings appear here as your videos perform.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {earnings.map((earning) => (
              <li
                key={earning.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold capitalize">
                    {earning.note ?? earning.source}
                  </p>
                  <p className="text-xs text-muted-foreground">{timeAgo(earning.created_at)}</p>
                </div>
                <p className="text-sm font-bold text-leaf">
                  +{formatMoney(earning.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowDownToLine className="size-4 text-brand" /> Request a withdrawal
        </h2>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Amount ({currency})</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Payout method</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
            >
              {PAYOUT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Destination</span>
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Phone number, account or email"
              className="mt-1 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            disabled={withdraw.isPending}
            className="gradient-brand w-full rounded-2xl py-3 text-sm font-bold text-brand-foreground disabled:opacity-60"
          >
            {withdraw.isPending ? "Requesting…" : "Request withdrawal"}
          </button>
        </form>

        {withdrawals.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {withdrawals.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {formatMoney(item.amount, currency)} · {item.method}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.destination} · {timeAgo(item.created_at)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
                    STATUS_STYLES[item.status] ?? "bg-secondary text-muted-foreground"
                  }`}
                >
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
