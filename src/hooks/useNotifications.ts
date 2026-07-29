import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Notification = {
  id: string;
  user_id: string; // recipient
  actor_id: string;
  type: string;
  reference_id?: string | null;
  message?: string | null;
  read: boolean;
  created_at: string;
  actor?: { id?: string; name?: string; initials?: string } | null;
};

export async function getNotifications(): Promise<Notification[]> {
  // RLS will ensure only the current user's notifications are returned
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, actor_id, type, reference_id, message, read, created_at, profiles(id, name, initials)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    actor_id: row.actor_id,
    type: row.type,
    reference_id: row.reference_id,
    message: row.message,
    read: row.read,
    created_at: row.created_at,
    actor: row.profiles ?? null,
  }));
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", notificationId);
  if (error) throw error;
}

export async function markAllAsRead(): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
  if (error) throw error;
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery(["notifications", "me"], () => getNotifications(), {
    enabled: !!user,
  });

  const markOne = useMutation((id: string) => markAsRead(id), {
    onMutate: async (id: string) => {
      await queryClient.cancelQueries(["notifications", "me"]);
      const previous = queryClient.getQueryData<Notification[]>(["notifications", "me"]);
      queryClient.setQueryData(["notifications", "me"], (old: any[]) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) queryClient.setQueryData(["notifications", "me"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries(["notifications", "me"]),
  });

  const markAll = useMutation(() => markAllAsRead(), {
    onMutate: async () => {
      await queryClient.cancelQueries(["notifications", "me"]);
      const previous = queryClient.getQueryData<Notification[]>(["notifications", "me"]);
      queryClient.setQueryData(["notifications", "me"], (old: any[]) => (old ?? []).map((n) => ({ ...n, read: true })));
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) queryClient.setQueryData(["notifications", "me"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries(["notifications", "me"]),
  });

  return {
    notifications: query.data ?? [],
    loading: query.isLoading,
    markAsRead: (id: string) => markOne.mutateAsync(id),
    marking: markOne.isLoading,
    markAllAsRead: () => markAll.mutateAsync(),
    markingAll: markAll.isLoading,
    refresh: () => queryClient.invalidateQueries(["notifications", "me"]),
  };
}
