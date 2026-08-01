import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StoredAiMessage = { id: string; role: "user" | "assistant"; text: string };

export const loadAiHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoredAiMessage[]> => {
    // Find the user's most recent conversation
    try {
      const { data: convRow, error: convErr } = await context.supabase
        .from("ai_conversations")
        .select("id")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (convErr) {
        // If conversation lookup fails, surface a safe error for server logs and return empty history
        console.error("[kc-earn-ai] failed to load conversation", convErr);
        return [];
      }

      const conversationId = convRow?.id ?? null;

      if (!conversationId) {
        // No conversation yet — return empty history so the UI shows the welcome state
        return [];
      }

      const { data, error } = await context.supabase
        .from("ai_messages")
        .select("id,role,parts,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) {
        console.error("[kc-earn-ai] failed to load messages for conversation", error);
        return [];
      }

      return (data ?? [])
        .filter((row) => row.role === "user" || row.role === "assistant")
        .map((row) => {
          const parts = Array.isArray(row.parts) ? row.parts : [];
          const text = parts
            .map((part) =>
              part && typeof part === "object" && "type" in part && part.type === "text"
                ? String((part as { text?: unknown }).text ?? "")
                : "",
            )
            .join("");
          return { id: row.id, role: row.role as "user" | "assistant", text };
        })
        .filter((message) => message.text.trim().length > 0);
    } catch (err) {
      console.error("[kc-earn-ai] unexpected error loading AI history", err);
      return [];
    }
  });


export const clearAiHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("ai_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
