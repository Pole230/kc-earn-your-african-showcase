import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Settings, Grid3x3, Bookmark, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PROFILE } from "@/data/content";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyVideos, formatDuration } from "@/lib/videos";
import { supabase } from "@/integrations/supabase/client";

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
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { data: myVideos = [] } = useQuery({
    queryKey: ["my-videos", user?.id],
    queryFn: () => fetchMyVideos(user!.id),
    enabled: !!user,
  });

  async function remove(id: string) {
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete video");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-videos"] });
    await queryClient.invalidateQueries({ queryKey: ["feed"] });
    toast.success("Video deleted");
  }


  return (
    <div className="pb-4">
      <div className="gradient-brand h-32 w-full sm:h-40" />

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

        <h1 className="mt-3 text-3xl font-bold tracking-tight">{PROFILE.name}</h1>
        <p className="text-sm text-muted-foreground">{PROFILE.handle}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" /> {PROFILE.location}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{PROFILE.bio}</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {Object.entries(PROFILE.stats).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border/80 bg-card py-3 text-center shadow-lift">
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
          {user ? (
            <button
              type="button"
              onClick={async () => {
                await queryClient.cancelQueries();
                queryClient.clear();
                await signOut();
                toast.success("Signed out");
              }}
              className="flex-1 rounded-2xl border border-border bg-surface py-3 text-sm font-bold"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="flex-1 rounded-2xl border border-border bg-surface py-3 text-center text-sm font-bold"
            >
              Sign in
            </Link>
          )}
        </div>

        <Link
          to="/dashboard"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4"
        >
          <Wallet className="size-5 shrink-0 text-leaf" />
          <span className="min-w-0 flex-1 text-sm font-semibold">Creator dashboard</span>
          <span className="text-xs text-muted-foreground">Earnings & payouts</span>
        </Link>

        {user ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold">My uploads</h2>
            {myVideos.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No uploads yet — publish your first video from the Upload tab.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {myVideos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
                  >
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {video.category} · {formatDuration(video.duration_seconds)} · {video.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${video.title}`}
                      onClick={() => remove(video.id)}
                      className="grid size-9 place-items-center rounded-xl border border-border text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}


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

        {tab === "saved" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Saved videos will appear here.</p>
        ) : null}
      </div>
    </div>
  );
}
