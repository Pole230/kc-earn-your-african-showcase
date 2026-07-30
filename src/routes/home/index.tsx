import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchHomeFeed, hydrateVideoUrls, type FeedOptions } from "@/lib/homeFeed";
import { useVideoLikes } from "@/hooks/useVideoLikes";
import { useComments } from "@/hooks/useComments";
import { UploadedVideoCard } from "@/components/UploadedVideoCard";
import { VideoCard } from "@/components/VideoCard";
import { CategoryChips } from "@/components/CategoryChips";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/home")({
  component: HomePage,
});

const PAGE_SIZE = 10;

type Sort = "recommended" | "trending" | "newest";

function HomePage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<Sort>("recommended");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const seen = useRef<Set<string>>(new Set());
  const preloadLinks = useRef<HTMLLinkElement[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const infinite = useInfiniteQuery(
    ["home-feed", category, sort],
    async ({ pageParam = 0 }) => {
      const opts: FeedOptions = { page: pageParam, pageSize: PAGE_SIZE, sort, category: category === "All" ? null : category };
      const { rows, nextPage } = await fetchHomeFeed(opts);
      // hydrate signed urls for this page
      const hydrated = await hydrateVideoUrls(rows as any[]);
      return { rows: hydrated, nextPage };
    },
    {
      getNextPageParam: (last) => last.nextPage,
      staleTime: 30 * 1000,
    }
  );

  const videos = infinite.data ? infinite.data.pages.flatMap((p) => p.rows) : [];

  // preload next 3 videos
  useEffect(() => {
    // clear old
    preloadLinks.current.forEach((l) => document.head.removeChild(l));
    preloadLinks.current = [];

    const toPreload = videos.slice(0, 3);
    toPreload.forEach((v) => {
      if (v?.videoUrl) {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "video";
        link.href = v.videoUrl;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
        preloadLinks.current.push(link);
      }
    });

    return () => {
      preloadLinks.current.forEach((l) => {
        try { document.head.removeChild(l); } catch (e) {}
      });
      preloadLinks.current = [];
    };
  }, [videos]);

  // autoplay/pause using IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          const video = el.querySelector("video") as HTMLVideoElement | null;
          if (!video) return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            // pause others
            videoRefs.current.forEach((v) => {
              if (v && v !== video) try { v.pause(); } catch (e) {}
            });
            // play this one
            if (video.paused) {
              const p = video.play();
              if (p && typeof p.then === "function") p.catch(() => {});
            }
          } else {
            if (!video.paused) try { video.pause(); } catch (e) {}
          }
        });
      },
      { threshold: [0.4, 0.6, 0.9] }
    );

    const nodes = Array.from(document.querySelectorAll("[data-feed-card]")) as HTMLElement[];
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [videos]);

  // infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && infinite.hasNextPage && !infinite.isFetchingNextPage) {
        infinite.fetchNextPage();
      }
    }, { rootMargin: "400px" });
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [infinite]);

  // realtime subscription for new published videos
  useEffect(() => {
    const channel = supabase.channel("public:videos-feed");
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "videos" }, (payload) => {
      const row = (payload as any).new;
      if (!row || row.status !== "published") return;
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      // prepend a minimal row; hydrate will fetch URL when it appears in viewport
      infinite.setQueryData(["home-feed", category, sort], (old: any) => {
        if (!old) return { pages: [{ rows: [row] }], pageParams: [0] };
        const pages = [...old.pages];
        pages[0] = { ...pages[0], rows: [row, ...(pages[0].rows ?? [])] };
        return { ...old, pages };
      });
    });

    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "videos" }, (payload) => {
      const row = (payload as any).new;
      const old = (payload as any).old;
      if (!row) return;
      // when status flips to published, prepend
      if (old?.status !== "published" && row.status === "published") {
        if (seen.current.has(row.id)) return;
        seen.current.add(row.id);
        infinite.setQueryData(["home-feed", category, sort], (oldData: any) => {
          if (!oldData) return { pages: [{ rows: [row] }], pageParams: [0] };
          const pages = [...oldData.pages];
          pages[0] = { ...pages[0], rows: [row, ...(pages[0].rows ?? [])] };
          return { ...oldData, pages };
        });
      } else {
        // Invalidate single video cache if present
        // For simplicity, refetch feed to pick up updates
        infinite.refetch();
      }
    });

    channel.subscribe();
    return () => supabase.removeChannel(channel);
  }, [category, sort, infinite]);

  // attach video refs
  const attachRef = useCallback((id: string, el: HTMLVideoElement | null) => {
    videoRefs.current.set(id, el);
  }, []);

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await infinite.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  // interactions: follow/save/share
  async function toggleFollow(creatorId: string) {
    const { data: session } = await supabase.auth.getSession();
    const me = session?.user;
    if (!me) return;
    try {
      const { data } = await supabase.from("follows").select("id").eq("follower_id", me.id).eq("following_id", creatorId).limit(1);
      if (data && data.length > 0) {
        await supabase.from("follows").delete().eq("id", data[0].id);
      } else {
        await supabase.from("follows").insert({ follower_id: me.id, following_id: creatorId });
      }
      // refresh feed for personalized recommendations
      infinite.refetch();
    } catch (e) {
      console.error(e);
    }
  }

  async function saveVideo(videoId: string) {
    const { data: session } = await supabase.auth.getSession();
    const me = session?.user;
    if (!me) return;
    try {
      await supabase.from("video_saves").insert({ video_id: videoId, user_id: me.id });
    } catch (e) {
      // ignore unique constraint
    }
  }

  async function shareVideo(video: any) {
    try {
      const shareData: any = { title: video.title, text: video.description ?? video.title };
      if (video.videoUrl) shareData.url = video.videoUrl;
      if (navigator.share) {
        await navigator.share(shareData);
        await supabase.from("video_shares").insert({ video_id: video.id, user_id: user?.id ?? null, platform: "native" });
      } else {
        await navigator.clipboard.writeText(window.location.origin + `/v/${video.id}`);
        await supabase.from("video_shares").insert({ video_id: video.id, user_id: user?.id ?? null, platform: "copy" });
      }
    } catch (e) { console.error(e); }
  }

  return (
    <main className="px-5 pb-8">
      <header className="grid grid-cols-[1fr_auto] items-center gap-3 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">KC Earn</p>
          <h1 className="truncate text-2xl font-bold">Home</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="grid size-11 place-items-center rounded-2xl border border-border bg-surface">
            <RefreshCw className="size-5" />
          </button>
        </div>
      </header>

      <div className="mb-3 flex items-center justify-between gap-3">
        <CategoryChips active={category} onSelect={setCategory} />

        <div className="flex gap-2">
          <SortButton active={sort === "recommended"} onClick={() => setSort("recommended")}>Recommended</SortButton>
          <SortButton active={sort === "trending"} onClick={() => setSort("trending")}>Trending</SortButton>
          <SortButton active={sort === "newest"} onClick={() => setSort("newest")}>Newest</SortButton>
        </div>
      </div>

      <section className="space-y-5">
        {/* Uploaded (current user) videos */}
        <UploadedSection />

        {/* Feed list */}
        {infinite.isLoading ? (
          <div className="h-64 animate-pulse rounded-3xl border border-border bg-surface" />
        ) : (
          <div className="space-y-5">
            {videos.map((v: any) => (
              <div key={v.id} data-feed-card className="feed-card">
                <FeedItem
                  video={v}
                  attachRef={(el: HTMLVideoElement | null) => attachRef(v.id, el)}
                  onFollow={() => toggleFollow(v.user_id)}
                  onSave={() => saveVideo(v.id)}
                  onShare={() => shareVideo(v)}
                />
              </div>
            ))}

            <div ref={sentinelRef} className="h-6" />

            {infinite.isFetchingNextPage && <div className="py-6 text-center text-sm text-muted-foreground">Loading more…</div>}
            {!infinite.hasNextPage && videos.length > 0 && <div className="py-6 text-center text-sm text-muted-foreground">You're all caught up</div>}
          </div>
        )}
      </section>
    </main>
  );
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-sm font-semibold ${active ? "bg-brand text-white" : "bg-surface text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function UploadedSection() {
  const { user } = useAuth();
  const [uploaded, setUploaded] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user) return setUploaded([]);
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("id,title,description,category,duration_seconds,views_count,created_at,status,user_id,video_path,thumbnail_path")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(6);
        if (error) throw error;
        if (!mounted) return;
        // hydrate urls
        const hydrated = await hydrateVideoUrls(data ?? []);
        if (mounted) setUploaded(hydrated);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  if (!user || uploaded.length === 0) return null;
  return (
    <section className="space-y-3">
      {uploaded.map((v) => (
        <UploadedVideoCard key={v.id} video={v} />
      ))}
    </section>
  );
}

function FeedItem({ video, attachRef, onFollow, onSave, onShare }: { video: any; attachRef: (el: HTMLVideoElement | null) => void; onFollow: () => void; onSave: () => void; onShare: () => void }) {
  const { likeCount, isLiked, likeVideo, unlikeVideo } = useVideoLikes(video.id);
  const { comments, addComment } = useComments(video.id);

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
        <video
          ref={attachRef}
          src={video.videoUrl ?? undefined}
          poster={video.thumbnailUrl ?? undefined}
          playsInline
          preload="metadata"
          controls={false}
          muted
          className="size-full object-cover"
        />

        <div className="absolute left-3 top-3 z-10">
          <button onClick={onFollow} className="rounded-full bg-background/70 px-3 py-1 text-xs font-semibold backdrop-blur">Follow</button>
        </div>

        <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-3">
          <button onClick={() => (isLiked ? unlikeVideo() : likeVideo())} className="rounded-full bg-background/70 px-3 py-1 text-xs font-semibold backdrop-blur">{isLiked ? "Liked" : "Like"} • {likeCount ?? 0}</button>
          <button onClick={() => onSave()} className="rounded-full bg-background/70 px-3 py-1 text-xs font-semibold backdrop-blur">Save</button>
          <button onClick={() => onShare()} className="rounded-full bg-background/70 px-3 py-1 text-xs font-semibold backdrop-blur">Share</button>
        </div>
      </div>

      <div className="px-4 py-3">
        <h3 className="text-base font-semibold line-clamp-2">{video.title}</h3>
        {video.description ? <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{video.description}</p> : null}
      </div>
    </article>
  );
}
