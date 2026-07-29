import { createFileRoute } from "@tanstack/react-router";
import { Heart, MessageCircle, UserPlus, Megaphone } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useNotifications } from "@/hooks/useNotifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — KC Earn" },
      {
        name: "description",
        content: "See likes, comments, new followers and platform updates on your KC Earn activity.",
      },
      { property: "og:title", content: "Notifications — KC Earn" },
      { property: "og:description", content: "Stay on top of activity around your KC Earn videos." },
    ],
  }),
  component: Notifications,
});

const iconFor = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: Megaphone,
} as const;

function Row({ item, onMark }: { item: any; onMark: (id: string) => void }) {
  const Icon = iconFor[item.type as keyof typeof iconFor] ?? Megaphone;
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-brand">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{item.actor?.name ?? "Someone"}</span>{" "}
          <span className="text-muted-foreground">{item.message}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
      </div>
      {!item.read ? <button onClick={() => onMark(item.id)} className="mt-1 size-6 rounded-full bg-brand text-brand-foreground text-[10px] px-2 py-1">Mark</button> : null}
    </li>
  );
}

function Notifications() {
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();

  const unread = notifications.filter((n) => !n.read);
  const earlier = notifications.filter((n) => n.read);

  return (
    <div className="px-5 pb-4">
      <ScreenHeader
        title="Notifications"
        subtitle={`${unread.length} new updates`}
        action={
          <button type="button" onClick={() => markAllAsRead()} className="text-sm font-semibold text-brand">
            Mark read
          </button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New</h2>
        <ul className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : unread.map((n) => <Row key={n.id} item={n} onMark={markAsRead} />)}
        </ul>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Earlier</h2>
        <ul className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : earlier.map((n) => <Row key={n.id} item={n} onMark={markAsRead} />)}
        </ul>
      </section>
    </div>
  );
}
