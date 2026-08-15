import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_videos",
  title: "List my videos",
  description:
    "List the signed-in KC Earn creator's uploaded videos with title, category, status and view count.",
  inputSchema: {
    limit: z.number().int().optional().describe("How many videos to return (default 20, max 50)."),
    category: z
      .string()
      .optional()
      .describe("Optional category filter: Funny, Music, Experience, Sports, Learning, Serious Topics."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, category }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to KC Earn to use this tool.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("videos")
      .select("id,title,description,category,status,views_count,duration_seconds,created_at")
      .eq("user_id", ctx.getUserId() as string)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 50));

    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const videos = data ?? [];
    return {
      content: [
        {
          type: "text" as const,
          text: videos.length
            ? videos
                .map(
                  (v: Record<string, unknown>) =>
                    `${String(v.title)} — ${String(v.category)} · ${String(v.status)} · ${String(v.views_count)} views (id ${String(v.id)})`,
                )
                .join("\n")
            : "No uploads yet.",
        },
      ],
      structuredContent: { videos },
    };
  },
});
