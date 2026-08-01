import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/data/content";
import type { FeedVideo } from "./videos";
import { hydrate } from "./videos";

export async function searchVideos(query: string, limit = 20): Promise<FeedVideo[]> {
  if (!query.trim()) return [];
  
  const searchTerm = `%${query.trim()}%`;
  
  // Search by title or description
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id,title,description,category,duration_seconds,views_count,created_at,status,user_id,video_path,thumbnail_path"
    )
    .eq("status", "published")
    .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("Search failed", error);
    return [];
  }
  
  return hydrate((data ?? []) as any);
}

export async function searchByCategory(category: Category, limit = 20): Promise<FeedVideo[]> {
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id,title,description,category,duration_seconds,views_count,created_at,status,user_id,video_path,thumbnail_path"
    )
    .eq("status", "published")
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("Category search failed", error);
    return [];
  }
  
  return hydrate((data ?? []) as any);
}

export async function searchByCreator(creatorName: string, limit = 20): Promise<FeedVideo[]> {
  if (!creatorName.trim()) return [];
  
  const searchTerm = `%${creatorName.trim()}%`;
  
  // First find matching profile
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .or(`display_name.ilike.${searchTerm},username.ilike.${searchTerm}`)
    .limit(5);
  
  if (profileError || !profiles || profiles.length === 0) {
    console.error("Creator search failed", profileError);
    return [];
  }
  
  const userIds = profiles.map((p: any) => p.id);
  
  // Then fetch videos from those creators
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id,title,description,category,duration_seconds,views_count,created_at,status,user_id,video_path,thumbnail_path"
    )
    .eq("status", "published")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("Videos search failed", error);
    return [];
  }
  
  return hydrate((data ?? []) as any);
}
