import { supabase } from "@/integrations/supabase/client";

export type FeedSort =
  | "recommended"
  | "trending"
  | "newest";

export interface FeedOptions {
  page: number;
  pageSize: number;
  sort: FeedSort;
  category?: string | null;
}

export async function fetchHomeFeed({
  page,
  pageSize,
  sort,
  category,
}: FeedOptions) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("videos")
    .select(`
      *,
      profiles (
        id,
        username,
        full_name,
        avatar_url
      )
    `)
    .eq("status", "published");

  if (category && category !== "All") {
    query = query.eq("category", category);
  }

  switch (sort) {
    case "trending":
      query = query.order("views", { ascending: false });
      break;

    case "recommended":
      query = query.order("score", { ascending: false });
      break;

    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query.range(from, to);

  if (error) throw error;

  return {
    rows: data ?? [],
    nextPage:
      (data?.length ?? 0) === pageSize
        ? page + 1
        : undefined,
  };
}

export async function hydrateVideoUrls(videos: any[]) {
  return Promise.all(
    videos.map(async (video) => {
      if (!video.video_path) return video;

      const { data } = await supabase.storage
        .from("videos")
        .createSignedUrl(video.video_path, 3600);

      const thumb = video.thumbnail_path
        ? await supabase.storage
            .from("videos")
            .createSignedUrl(video.thumbnail_path, 3600)
        : null;

      return {
        ...video,
        videoUrl: data?.signedUrl ?? null,
        thumbnailUrl: thumb?.data?.signedUrl ?? null,
      };
    })
  );
}
