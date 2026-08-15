import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "browse_feed",
  title: "Browse KC Earn feed",
  description:
    "Browse published KC Earn videos, optionally filtered by category and sorted by newest or most viewed.",
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe("Category filter: Funny, Music, Experience, Sports, Learning, Serious Topics."),
    sort: z.enum(["newest", "most_viewed"]).optional().describe("Sort order (default newest)."),
    limit: z.number().int().optional().describe("How many videos to return (default 20, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, sort, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to KC Earn to use this tool.");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("videos")
      .select("id,title,description,category,views_count,duration_seconds,created_at")
      .eq("status", "published")
      .limit(Math.min(Math.max(limit ?? 20, 1), 50));

    if (category) query = query.eq("category", category);
    query =
      sort === "most_viewed"
        ? query.order("views_count", { ascending: false })
        : query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const videos = data ?? [];
    return {
      content: [
        {
          type: "text" as const,
          text: videos.length
            ? videos
                .map((v) => `${v.title} — ${v.category} · ${v.views_count} views (id ${v.id})`)
                .join("\n")
            : "No published videos found.",
        },
      ],
      structuredContent: { videos },
    };
  },
});
