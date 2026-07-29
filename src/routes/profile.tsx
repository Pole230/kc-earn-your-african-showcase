import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Settings, Grid3x3, Bookmark } from "lucide-react";
import { PROFILE, VIDEOS } from "@/data/content";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — KC Earn" },
      {
        name: "description",
        content: "Manage your KC Earn creator profile, view your videos, followers and saved content.",
      },
      { property: "og:title", content: "Your Profile — KC Earn" },
      { property: "og:description", content: "Your KC Earn creator profile and video library." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const [tab, setTab] = useState<"videos" | "saved">("videos");
  const posts = tab === "videos" ? VIDEOS : VIDEOS.slice(2, 5);

  return (
    <div className="pb-4">
      <div className="gradient-brand h-28 w-full" />

      <div className="px-5">
        <div className="-mt-10 flex items-end gap-4">
          <span className="grid size-20 shrink-0 place-items-center rounded-3xl border-4 border-background bg-surface-strong text-xl font-bold text-brand">
            {PROFILE.initials}
          </span>
          <button
            type="button"
            aria-label="Settings"
            className="mb-1 ml-auto grid size-10 place-items-center rounded-xl border border-border bg-surface"
          >
            <Settings className="size-5" />
          </button>
        </div>

        <h1 className="mt-3 text-2xl font-bold">{PROFILE.name}</h1>
        <p className="text-sm text-muted-foreground">{PROFILE.handle}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" /> {PROFILE.location}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{PROFILE.bio}</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {Object.entries(PROFILE.stats).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border bg-card py-3 text-center">
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs capitalize text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="gradient-brand flex-1 rounded-2xl py-3 text-sm font-bold text-brand-foreground"
          >
            Edit profile
          </button>
          <button
            type="button"
            className="flex-1 rounded-2xl border border-border bg-surface py-3 text-sm font-bold"
          >
            Share profile
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1">
          {(
            [
              ["videos", "Videos", Grid3x3],
              ["saved", "Saved", Bookmark],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={
                tab === key
                  ? "flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-brand-foreground"
                  : "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-muted-foreground"
              }
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {posts.map((post) => (
            <div key={post.id} className="relative aspect-[3/4] overflow-hidden rounded-xl">
              <img
                src={post.thumbnail}
                alt={post.title}
                width={576}
                height={768}
                loading="lazy"
                className="size-full object-cover"
              />
              <div className="veil absolute inset-0" />
              <span className="absolute bottom-1.5 left-2 text-[11px] font-semibold">{post.views}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
