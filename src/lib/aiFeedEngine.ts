import { supabase } from "@/integrations/supabase/client";
import type { FeedVideo } from "./homeFeed";

export type FeedMode =
  | "recommended"
  | "trending"
  | "following"
  | "newest";

interface FeedOptions {
  userId?: string;
  mode: FeedMode;
  page?: number;
  pageSize?: number;
}

export async function getSmartFeed({
  userId,
  mode,
  page = 0,
  pageSize = 10,
}: FeedOptions): Promise<FeedVideo[]> {

  let query = supabase
    .from("videos")
    .select(`
      *,
      profiles(
        id,
        username,
        display_name,
        avatar_url
      )
    `)
    .eq("status", "published");

  switch (mode) {
    case "newest":
      query = query.order("created_at", {
        ascending: false,
      });
      break;

    case "trending":
      query = query
        .order("views_count", {
          ascending: false,
        })
        .order("likes_count", {
          ascending: false,
        });
      break;

    case "following":
      if (userId) {
        const { data: following } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", userId);

        const ids =
          following?.map(f => f.following_id) ?? [];

        query = query.in("user_id", ids);
      }
      break;

    case "recommended":
    default:
      query = query
        .order("ai_score", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        });
      break;
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await query.range(from, to);

  if (error) throw error;

  return (data ?? []) as FeedVideo[];
}

/**
 * AI scoring formula
 * Used by worker to rank videos.
 */
export function calculateAIScore(video: {
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  watch_time: number;
  completion_rate: number;
}) {

  return (
    video.views_count * 0.15 +
    video.likes_count * 0.25 +
    video.comments_count * 0.20 +
    video.shares_count * 0.20 +
    video.watch_time * 0.10 +
    video.completion_rate * 0.10
  );
}

/**
 * Future:
 * - AI embeddings
 * - User interests
 * - Similar videos
 * - Watch history
 * - Creator affinity
 * - Geo recommendations
 * - Language preference
 */
