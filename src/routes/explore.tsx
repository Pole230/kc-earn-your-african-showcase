import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { CREATORS, VIDEOS } from "@/data/content";

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

  const posts = VIDEOS.filter(
    (v) =>
      (category === "All" || v.category === category) &&
      (query.trim() === "" ||
        v.title.toLowerCase().includes(query.toLowerCase()) ||
        v.creator.name.toLowerCase().includes(query.toLowerCase())),
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
          {CREATORS.map((c) => (
            <div
              key={c.handle}
              className="w-36 shrink-0 rounded-2xl border border-border bg-card p-4 text-center"
            >
              <span className="gradient-brand mx-auto grid size-12 place-items-center rounded-full text-sm font-bold text-brand-foreground">
                {c.initials}
              </span>
              <p className="mt-3 truncate text-sm font-semibold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">{c.followers} followers</p>
              <button
                type="button"
                className="mt-3 w-full rounded-full border border-brand px-3 py-1.5 text-xs font-bold text-brand"
              >
                Follow
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {category === "All" ? "Trending now" : category}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {posts.map((post) => (
            <article key={post.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative aspect-[3/4]">
                <img
                  src={post.thumbnail}
                  alt={post.title}
                  width={576}
                  height={768}
                  loading="lazy"
                  className="size-full object-cover"
                />
                <div className="veil absolute inset-0" />
                <span className="absolute bottom-2 left-2 text-xs font-semibold text-foreground">
                  {post.views} views
                </span>
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{post.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{post.creator.handle}</p>
              </div>
            </article>
          ))}
        </div>
        {posts.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No results found.</p>
        ) : null}
      </section>
    </div>
  );
}
