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
  status: "processing" | "published" | "removed";
  user_id: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  creator: { display_name: string; username: string | null; location: string | null };
};

type Row = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  duration_seconds: number | null;
  views_count: number;
  created_at: string;
  status: "processing" | "published" | "removed";
  user_id: string;
  video_path: string;
  thumbnail_path: string | null;
  profiles: { display_name: string; username: string | null; location: string | null } | null;
};

const SELECT =
  "id,title,description,category,duration_seconds,views_count,created_at,status,user_id,video_path,thumbnail_path,profiles(display_name,username,location)";

async function signAll(bucket: string, paths: string[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 60 * 60);
  data?.forEach((item) => {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  });
  return map;
}

async function hydrate(rows: Row[]): Promise<FeedVideo[]> {
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
      display_name: r.profiles?.display_name ?? "KC Earn creator",
      username: r.profiles?.username ?? null,
      location: r.profiles?.location ?? null,
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
