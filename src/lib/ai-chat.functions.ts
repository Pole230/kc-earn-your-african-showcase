import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StoredAiMessage = { id: string; role: "user" | "assistant"; text: string };

export const loadAiHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoredAiMessage[]> => {
    const { data, error } = await context.supabase
      .from("ai_messages")
      .select("id,role,parts,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw new Error(error.message);

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
