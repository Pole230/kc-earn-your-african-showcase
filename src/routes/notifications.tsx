import { createFileRoute } from "@tanstack/react-router";
import { Heart, MessageCircle, UserPlus, Megaphone } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { NOTIFICATIONS, type Notification } from "@/data/content";

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

function Row({ item }: { item: Notification }) {
  const Icon = iconFor[item.type];
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-brand">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{item.actor}</span>{" "}
          <span className="text-muted-foreground">{item.text}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.time}</p>
      </div>
      {item.unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" /> : null}
    </li>
  );
}

function Notifications() {
  const unread = NOTIFICATIONS.filter((n) => n.unread);
  const earlier = NOTIFICATIONS.filter((n) => !n.unread);

  return (
    <div className="px-5 pb-4">
      <ScreenHeader
        title="Notifications"
        subtitle={`${unread.length} new updates`}
        action={
          <button type="button" className="text-sm font-semibold text-brand">
            Mark read
          </button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New</h2>
        <ul className="space-y-3">
          {unread.map((n) => (
            <Row key={n.id} item={n} />
          ))}
        </ul>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Earlier</h2>
        <ul className="space-y-3">
          {earlier.map((n) => (
            <Row key={n.id} item={n} />
          ))}
        </ul>
      </section>
    </div>
  );
}
