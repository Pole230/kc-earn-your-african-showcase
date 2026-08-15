import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_earnings",
  title: "List recent earnings",
  description:
    "List the signed-in KC Earn creator's most recent earning events (amount, source and date).",
  inputSchema: {
    limit: z.number().int().optional().describe("How many entries to return (default 20, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to KC Earn to use this tool.");
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("earnings")
      .select("id,amount,source,note,video_id,created_at")
      .eq("user_id", ctx.getUserId() as string)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (error) throw new ToolError(error.message);

    const earnings = data ?? [];
    const total = earnings.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    return {
      content: [
        {
          type: "text" as const,
          text: earnings.length
            ? `${earnings.length} entries totalling ${total.toFixed(2)}:\n` +
              earnings
                .map(
                  (row) =>
                    `${new Date(row.created_at).toISOString().slice(0, 10)} · ${row.source} · ${Number(row.amount).toFixed(2)}`,
                )
                .join("\n")
            : "No earnings recorded yet.",
        },
      ],
      structuredContent: { total, earnings },
    };
  },
});
