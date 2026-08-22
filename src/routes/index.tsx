import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Sparkles, Wallet } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CategoryChips } from "@/components/CategoryChips";
import { UploadedVideoCard } from "@/components/UploadedVideoCard";
import { fetchFeed, type ExternalFeedVideo } from "@/lib/videos";
import { ExternalVideoCard } from "@/components/ExternalVideoCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KC Earn — African Social Video Feed" },
      {
        name: "description",
        content:
          "Watch and share African stories: funny clips, music, sports, learning and serious topics from creators across the continent.",
      },
      { property: "og:title", content: "KC Earn — African Social Video Feed" },
      {
        property: "og:description",
        content: "A mobile-first home for African creators and the stories they share.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const [category, setCategory] = useState("All");
  // Use only real uploaded videos from Supabase. Remove mock/demo data.
  const { data: uploaded = [], isLoading } = useQuery({
    queryKey: ["feed", category],
    queryFn: () => fetchFeed(category),
  });

  return (
    <div className="px-5 pb-4 pt-6 sm:px-8 sm:pt-9">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">KC Earn / Showcase</p>
          <h1 className="truncate text-3xl font-bold tracking-tight">Your feed</h1>
        </div>
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border/80 bg-surface text-foreground transition-colors hover:border-brand/60 hover:text-brand"
        >
          <Bell className="size-5" />
        </Link>
      </header>

      <div className="mt-6 flex items-center gap-3 rounded-3xl border border-brand/20 bg-gradient-to-r from-surface to-surface/60 p-4 shadow-lift">
        <Sparkles className="size-5 shrink-0 text-brand" />
        <p className="text-sm text-muted-foreground">
          Fresh drops from creators you follow, updated through the day.
        </p>
      </div>

      <Link
        to="/dashboard"
        className="mt-3 flex items-center gap-3 rounded-3xl border border-border/80 bg-surface p-4 transition-colors hover:border-brand/40"
      >
        <Wallet className="size-5 shrink-0 text-leaf" />
        <span className="min-w-0 flex-1 text-sm font-semibold">Creator dashboard</span>
        <span className="text-xs text-muted-foreground">Views · Earnings · Payouts</span>
      </Link>

      <div className="sticky top-0 z-30 -mx-5 bg-background/90 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <CategoryChips active={category} onSelect={setCategory} />
      </div>

      <section className="space-y-5 pb-4">
        {/* Render only uploaded videos fetched from Supabase */}
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-3xl border border-border bg-surface" />
        ) : (
          uploaded.map((video) =>
            "source" in video && video.source === "external" ? (
              <ExternalVideoCard key={video.id} video={video as ExternalFeedVideo} />
            ) : (
              <UploadedVideoCard
                key={video.id}
                video={video as Exclude<typeof video, ExternalFeedVideo>}
              />
            ),
          )
        )}

        {!isLoading && uploaded.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nothing here yet in {category}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
