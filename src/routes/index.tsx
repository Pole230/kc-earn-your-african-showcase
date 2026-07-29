import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CategoryChips } from "@/components/CategoryChips";
import { VideoCard } from "@/components/VideoCard";
import { UploadedVideoCard } from "@/components/UploadedVideoCard";
import { VIDEOS } from "@/data/content";
import { fetchFeed } from "@/lib/videos";

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
  const posts = category === "All" ? VIDEOS : VIDEOS.filter((v) => v.category === category);

  return (
    <div className="px-5 pt-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">KC Earn</p>
          <h1 className="truncate text-2xl font-bold">Your feed</h1>
        </div>
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <Bell className="size-5" />
        </Link>
      </header>

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
        <Sparkles className="size-5 shrink-0 text-brand" />
        <p className="text-sm text-muted-foreground">
          Fresh drops from creators you follow, updated through the day.
        </p>
      </div>

      <div className="sticky top-0 z-30 -mx-5 bg-background/90 px-5 py-4 backdrop-blur">
        <CategoryChips active={category} onSelect={setCategory} />
      </div>

      <section className="space-y-5 pb-4">
        {posts.map((post, i) => (
          <VideoCard key={post.id} post={post} priority={i === 0} />
        ))}
        {posts.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nothing here yet in {category}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
