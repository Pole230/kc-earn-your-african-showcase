import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_wallet_summary",
  title: "Get wallet summary",
  description:
    "Get the signed-in KC Earn creator's wallet: available balance, pending balance and lifetime earnings.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to KC Earn to use this tool.");
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("wallets")
      .select("available_balance,pending_balance,lifetime_earned,currency")
      .eq("user_id", ctx.getUserId() as string)
      .maybeSingle();
    if (error) throw new ToolError(error.message);

    const wallet = data ?? {
      available_balance: 0,
      pending_balance: 0,
      lifetime_earned: 0,
      currency: "USD",
    };

    return {
      content: [
        {
          type: "text" as const,
          text: `Available: ${wallet.currency} ${Number(wallet.available_balance).toFixed(2)}\nPending: ${wallet.currency} ${Number(wallet.pending_balance).toFixed(2)}\nLifetime earned: ${wallet.currency} ${Number(wallet.lifetime_earned).toFixed(2)}`,
        },
      ],
      structuredContent: { wallet },
    };
  },
});
