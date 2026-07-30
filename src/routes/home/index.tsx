// src/routes/home/index.tsx

import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/home")({
  component: HomePage,
});

const PAGE_SIZE = 10;

function HomePage() {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["home-feed"],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        videos: data,
        nextPage: data.length === PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      if (
        entries[0].isIntersecting &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    });

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const videos =
    data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <main className="mx-auto max-w-xl p-4">

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          KC Earn Feed
        </h1>

        <button
          onClick={() => refetch()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <p>Loading videos...</p>
      )}

      {!isLoading &&
        videos.map((video: any) => (
          <div
            key={video.id}
            className="mb-8 rounded-xl border p-3 shadow"
          >
            <video
              src={video.video_url}
              controls
              preload="metadata"
              className="w-full rounded-lg"
            />

            <h2 className="mt-3 text-xl font-bold">
              {video.title}
            </h2>

            <p className="text-gray-600">
              {video.description}
            </p>

            <div className="mt-3 flex gap-4 text-sm">
              <span>❤️ {video.likes ?? 0}</span>
              <span>💬 {video.comments ?? 0}</span>
              <span>👁️ {video.views ?? 0}</span>
            </div>
          </div>
        ))}

      <div ref={loadMoreRef} className="h-10" />

      {isFetchingNextPage && (
        <p className="text-center">
          Loading more...
        </p>
      )}
    </main>
  );
}
