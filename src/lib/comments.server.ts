import type { PostgrestClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Server-side helpers for comments. These functions are intentionally thin wrappers
// around Supabase operations so they can be used in server routes or RPC handlers.

export type CommentRow = {
  id: string;
  video_id: string;
  user_id: string;
  parent_id?: string | null;
  content: string;
  created_at: string;
};

export async function listComments(
  supabase: PostgrestClient,
  videoId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ data: CommentRow[] | null; error: any }>
{
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rangeStart = offset;
  const rangeEnd = offset + limit - 1;

  const { data, error } = await supabase
    .from('comments')
    .select('id, video_id, user_id, parent_id, content, created_at')
    .eq('video_id', videoId)
    .order('created_at', { ascending: false })
    .range(rangeStart, rangeEnd);

  return { data: data as CommentRow[] | null, error };
}

export async function createComment(
  supabase: PostgrestClient,
  payload: { video_id: string; user_id: string; content: string; parent_id?: string | null },
): Promise<{ data: CommentRow | null; error: any }>
{
  const insert = {
    video_id: payload.video_id,
    user_id: payload.user_id,
    content: payload.content,
    parent_id: payload.parent_id ?? null,
  };

  const { data, error } = await supabase
    .from('comments')
    .insert<CommentRow>([insert])
    .select()
    .single();

  return { data: data as CommentRow | null, error };
}
