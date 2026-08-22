import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/data/content";

export type FeedVideo = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  duration_seconds: number | null;
  views_count: number;
  created_at: string;
  status: "processing" | "published" | "failed" | "removed";
  user_id: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  creator: { display_name: string; username: string | null; location: string | null };
};

export type ExternalFeedVideo = {
  id: string;
  source: "external";
  source_platform: string;
  original_url: string;
  title: string;
  description: string | null;
  category: Category;
  published_at: string | null;
  thumbnailUrl: string | null;
  embedUrl: string;
  creator: { display_name: string; location: string | null };
};

type Row = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  duration_seconds: number | null;
  views_count: number;
  created_at: string;
  status: "processing" | "published" | "failed" | "removed";
  user_id: string;
  video_path: string;
  thumbnail_path: string | null;
};

const SELECT =
  "id,title,description,category,duration_seconds,views_count,created_at,status,user_id,video_path,thumbnail_path";

export async function signAll(bucket: string, paths: string[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return map;

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, 60 * 60);

    if (error) {
      console.error(`Failed to create signed URLs for bucket "${bucket}":`, error);
      return map;
    }

    data?.forEach((item) => {
      if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
    });
  } catch (err) {
    console.error(`Exception creating signed URLs for bucket "${bucket}":`, err);
  }

  return map;
}

export async function hydrate(rows: Row[]): Promise<FeedVideo[]> {
  const [videoUrls, thumbUrls] = await Promise.all([
    signAll(
      "videos",
      rows.map((r) => r.video_path),
    ),
    signAll(
      "thumbnails",
      rows.map((r) => r.thumbnail_path).filter((p): p is string => !!p),
    ),
  ]);

  // Fetch creator profiles explicitly using user_id so we don't depend on a DB relationship name
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const profilesMap = new Map<
    string,
    { display_name: string; username: string | null; location: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id,display_name,username,location")
      .in("id", userIds);
    if (profilesError) {
      // If profiles cannot be fetched due to RLS or other issues, fall back to defaults.
      console.error("Failed to fetch profiles for feed hydrate:", profilesError);
    } else {
      profilesData?.forEach((p) => {
        profilesMap.set(p.id, {
          display_name: p.display_name,
          username: p.username ?? null,
          location: p.location ?? null,
        });
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    duration_seconds: r.duration_seconds,
    views_count: r.views_count,
    created_at: r.created_at,
    status: r.status,
    user_id: r.user_id,
    videoUrl: videoUrls.get(r.video_path) ?? null,
    thumbnailUrl: r.thumbnail_path ? (thumbUrls.get(r.thumbnail_path) ?? null) : null,
    creator: {
      display_name: profilesMap.get(r.user_id)?.display_name ?? "KC Earn creator",
      username: profilesMap.get(r.user_id)?.username ?? null,
      location: profilesMap.get(r.user_id)?.location ?? null,
    },
  }));
}

export async function fetchFeed(category?: string) {
  let query = supabase
    .from("videos")
    .select(SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  if (category && category !== "All") query = query.eq("category", category as Category);

  const { data, error } = await query;
  if (error) throw error;
  const uploads = await hydrate((data ?? []) as unknown as Row[]);
  const externalQuery = supabase
    .from("external_videos")
    .select(
      "id,source_platform,original_url,title,description,category,published_at,thumbnail_url,embed_url,creator_name,country_code",
    )
    .eq("external_status", "active")
    .not("embed_url", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);
  const { data: externalData, error: externalError } =
    category && category !== "All"
      ? await externalQuery.eq("category", category as Category)
      : await externalQuery;
  if (externalError) throw externalError;
  const external = (externalData ?? []).flatMap((video) =>
    video.embed_url
      ? [
          {
            id: `external:${video.source_platform}:${video.id}`,
            source: "external" as const,
            source_platform: video.source_platform,
            original_url: video.original_url,
            title: video.title,
            description: video.description,
            category: video.category,
            published_at: video.published_at,
            thumbnailUrl: video.thumbnail_url,
            embedUrl: video.embed_url,
            creator: { display_name: video.creator_name, location: video.country_code },
          },
        ]
      : [],
  );
  return [...uploads, ...external] as Array<FeedVideo | ExternalFeedVideo>;
}

// New: fetch a page of feed items for infinite scrolling. Returns up to `limit` items
// ordered by created_at descending. If `before` is provided it will fetch items
// with created_at < before (older items).
export async function fetchFeedPage(category?: string, limit = 6, before?: string | null) {
  let query = supabase
    .from("videos")
    .select(SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category && category !== "All") query = query.eq("category", category as Category);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) throw error;
  return hydrate((data ?? []) as unknown as Row[]);
}

export async function fetchMyVideos(userId: string) {
  const { data, error } = await supabase
    .from("videos")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrate((data ?? []) as unknown as Row[]);
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
