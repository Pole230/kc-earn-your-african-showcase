import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_notifications",
  title: "List notifications",
  description: "List the signed-in KC Earn user's recent notifications, newest first.",
  inputSchema: {
    limit: z.number().int().optional().describe("How many notifications to return (default 20, max 50)."),
    unread_only: z.boolean().optional().describe("Return only unread notifications."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, unread_only }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to KC Earn to use this tool.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("notifications")
      .select("id,title,body,kind,read_at,created_at")
      .eq("user_id", ctx.getUserId() as string)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 50));

    if (unread_only) query = query.is("read_at", null);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const notifications = data ?? [];
    return {
      content: [
        {
          type: "text" as const,
          text: notifications.length
            ? notifications
                .map(
                  (n) =>
                    `${n.read_at ? "read" : "unread"} · ${n.kind} · ${n.title}${n.body ? ` — ${n.body}` : ""}`,
                )
                .join("\n")
            : "No notifications.",
        },
      ],
      structuredContent: { notifications },
    };
  },
});
