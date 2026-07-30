import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Simple server-side helpers for video storage and DB integration.
 * Keep these small and focused for Stage 9.1.
 */

export type CreateVideoPayload = {
  user_id: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  video_path: string;
  thumbnail_path?: string | null;
  duration_seconds?: number | null;
  status?: "processing" | "published" | "removed" | string;
};

export async function createVideoRecord(payload: CreateVideoPayload) {
  // Cast to any to avoid strict generated Insert type mismatches at compile time
  const { data, error } = await supabaseAdmin.from("videos").insert(payload as any).select().single();
  return { data, error };
}

export async function updateVideoStatus(id: string, status: string) {
  const { data, error } = await supabaseAdmin.from("videos").update({ status }).eq("id", id).select().single();
  return { data, error };
}

export async function createSignedUrl(bucket: string, path: string, expires = 60 * 60) {
  // returns { signedUrl, error }
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expires);
    if (error) return { signedUrl: null as string | null, error };
    return { signedUrl: data.signedUrl ?? null, error: null };
  } catch (err) {
    return { signedUrl: null as string | null, error: err as unknown };
  }
}
