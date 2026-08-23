import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, UserPlus, Megaphone, CheckCheck } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchNotifications,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/monetization";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — KC Earn" },
      {
        name: "description",
        content:
          "See likes, comments, new followers and platform updates on your KC Earn activity.",
      },
      { property: "og:title", content: "Notifications — KC Earn" },
      {
        property: "og:description",
        content: "Stay on top of activity around your KC Earn videos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Notifications,
});

const iconFor: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: Megaphone,
} as const;

function Row({ item }: { item: AppNotification }) {
  const Icon = iconFor[item.kind] ?? Megaphone;
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-brand">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{item.title}</span>{" "}
          {item.body ? <span className="text-muted-foreground">{item.body}</span> : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </p>
      </div>
      {!item.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" /> : null}
    </li>
  );
}

function Notifications() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => fetchNotifications(),
    enabled: Boolean(user),
  });
  const markRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
  const unread = notifications.filter((notification) => !notification.read_at);
  const earlier = notifications.filter((notification) => notification.read_at);

  return (
    <div className="px-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <ScreenHeader title="Notifications" subtitle={`${unread.length} new updates`} />
        {unread.length > 0 ? (
          <button
            type="button"
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending}
            aria-label="Mark all notifications as read"
            className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:text-brand disabled:opacity-50"
          >
            <CheckCheck className="size-5" />
          </button>
        ) : null}
      </div>

      {!loading && !user ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          Sign in to view your notifications.
        </p>
      ) : null}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-3xl border border-border bg-surface" />
      ) : null}
      {isError ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
          <p>Notifications could not be loaded.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 font-semibold text-brand"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!isLoading && !isError && user ? (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New</h2>
          <ul className="space-y-3">
            {unread.map((n) => (
              <Row key={n.id} item={n} />
            ))}
          </ul>
        </section>
      ) : null}

      {!isLoading && !isError && user ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Earlier
          </h2>
          <ul className="space-y-3">
            {earlier.map((n) => (
              <Row key={n.id} item={n} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
