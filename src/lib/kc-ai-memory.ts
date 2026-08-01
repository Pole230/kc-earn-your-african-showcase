import { supabase } from "@/integrations/supabase/client";
import type { PostgrestError } from "@supabase/supabase-js";

export type Conversation = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
};

export type AiMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Result<T> = { data: T | null; error: Error | PostgrestError | null };

export async function createConversation(title?: string): Promise<Result<Conversation>> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    const payload = { user_id: userId, title: title ?? null };

    const { data, error } = await supabase
      .from("ai_conversations")
      .insert(payload)
      .select("id, user_id, title, created_at")
      .single();

    if (error) return { data: null, error };
    return { data: data as Conversation, error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

export async function getConversations(): Promise<Result<Conversation[]>> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, user_id, title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error };
    return { data: (data ?? []) as Conversation[], error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

export async function getMessages(conversationId: string): Promise<Result<AiMessage[]>> {
  if (!conversationId) return { data: null, error: new Error("conversationId is required") };
  try {
    const { data, error } = await supabase
      .from("ai_messages")
      .select("id, conversation_id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) return { data: null, error };
    return { data: (data ?? []) as AiMessage[], error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<Result<AiMessage>> {
  if (!conversationId) return { data: null, error: new Error("conversationId is required") };
  if (!content || !content.trim()) return { data: null, error: new Error("content is required") };
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    const insert = {
      conversation_id: conversationId,
      role,
      content,
    };

    const { data, error } = await supabase
      .from("ai_messages")
      .insert(insert)
      .select("id, conversation_id, role, content, created_at")
      .single();

    if (error) return { data: null, error };
    return { data: data as AiMessage, error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}
