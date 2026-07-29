import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Comment = {
  id: string;
  video_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: { id?: string; name?: string; initials?: string } | null;
};

export async function getComments(videoId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("video_comments")
    .select(`id, body, created_at, user_id, profiles(id, name, initials)`)
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // normalize shape: profiles -> profile
  return (
    (data as any[]).map((row) => ({
      id: row.id,
      video_id: videoId,
      user_id: row.user_id,
      body: row.body,
      created_at: row.created_at,
      profile: row.profiles ?? null,
    })) as Comment[]
  );
}

export async function addComment(videoId: string, body: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("video_comments").insert({
    video_id: videoId,
    user_id: user.id,
    body,
  });
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("video_comments").delete().eq("id", commentId);
  if (error) throw error;
}

export function useComments(videoId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery(["video", videoId, "comments"], () => getComments(videoId), {
    enabled: !!videoId,
  });

  const addMutation = useMutation((body: string) => addComment(videoId, body), {
    onMutate: async (body: string) => {
      await queryClient.cancelQueries(["video", videoId, "comments"]);
      const previous = queryClient.getQueryData<Comment[]>(["video", videoId, "comments"]);
      const tmp: Comment = {
        id: `tmp-${Math.random().toString(36).slice(2, 9)}`,
        video_id: videoId,
        user_id: user?.id ?? "",
        body,
        created_at: new Date().toISOString(),
        profile: user ? { id: user.id, name: (user.user_metadata as any)?.name ?? user.email ?? "You", initials: "" } : null,
      };
      queryClient.setQueryData(["video", videoId, "comments"], (old: any) => [tmp, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["video", videoId, "comments"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(["video", videoId, "comments"]);
    },
  });

  const deleteMutation = useMutation((id: string) => deleteComment(id), {
    onMutate: async (id: string) => {
      await queryClient.cancelQueries(["video", videoId, "comments"]);
      const previous = queryClient.getQueryData<Comment[]>(["video", videoId, "comments"]);
      queryClient.setQueryData(["video", videoId, "comments"], (old: any[]) => (old ?? []).filter((c) => c.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["video", videoId, "comments"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(["video", videoId, "comments"]);
    },
  });

  return {
    comments: query.data ?? [],
    loading: query.isLoading,
    addComment: (body: string) => addMutation.mutateAsync(body),
    adding: addMutation.isLoading,
    deleteComment: (id: string) => deleteMutation.mutateAsync(id),
    deleting: deleteMutation.isLoading,
    refresh: () => queryClient.invalidateQueries(["video", videoId, "comments"]),
  };
}
