import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { UploadedVideoCard } from "@/components/UploadedVideoCard";
import { ExternalVideoCard } from "@/components/ExternalVideoCard";
import { fetchFeed, type ExternalFeedVideo, type FeedVideo } from "@/lib/videos";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore Creators & Categories — KC Earn" },
      {
        name: "description",
        content:
          "Discover trending African creators and browse videos by Funny, Music, Experience, Sports, Learning and Serious Topics.",
      },
      { property: "og:title", content: "Explore Creators & Categories — KC Earn" },
      {
        property: "og:description",
        content: "Find new African creators and categories to follow on KC Earn.",
      },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const {
    data: videos = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["explore-feed", category],
    queryFn: () => fetchFeed(category),
  });

  const posts = videos.filter(
    (video) =>
      (category === "All" || video.category === category) &&
      (query.trim() === "" ||
        video.title.toLowerCase().includes(query.toLowerCase()) ||
        video.creator.display_name.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="px-5">
      <ScreenHeader title="Explore" subtitle="Creators and stories from across Africa" />

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos or creators"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="py-4">
        <CategoryChips active={category} onSelect={setCategory} />
      </div>

      <section className="pb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="size-4 text-brand" /> Rising creators
        </h2>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
          <p className="px-1 text-sm text-muted-foreground">
            Search the latest published videos to discover creators on KC Earn.
          </p>
        </div>
      </section>

      <section className="pb-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {category === "All" ? "Trending now" : category}
        </h2>
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-3xl border border-border bg-surface" />
        ) : null}
        {isError ? (
          <div className="rounded-3xl border border-border bg-surface p-8 text-center">
            <p className="text-sm font-semibold">The explore feed could not be loaded.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        ) : null}
        {!isLoading && !isError
          ? posts.map((video) =>
              "source" in video && video.source === "external" ? (
                <ExternalVideoCard key={video.id} video={video as ExternalFeedVideo} />
              ) : (
                <UploadedVideoCard key={video.id} video={video as FeedVideo} />
              ),
            )
          : null}
        {!isLoading && !isError && posts.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No results found.</p>
        ) : null}
      </section>
    </div>
  );
}
