import { auth, defineMcp } from "@lovable.dev/mcp-js";
import browseFeedTool from "./tools/browse-feed";
import getWalletSummaryTool from "./tools/get-wallet-summary";
import listMyVideosTool from "./tools/list-my-videos";
import listNotificationsTool from "./tools/list-notifications";
import listRecentEarningsTool from "./tools/list-recent-earnings";

// The OAuth issuer must be the direct project host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "kc-earn-your-african-showcase",
  title: "KC Earn: Your African Showcase",
  version: "0.1.0",
  instructions:
    "Tools for KC Earn, an African social video platform. Use `browse_feed` to explore published videos, `list_my_videos` for the signed-in creator's uploads, `get_wallet_summary` and `list_recent_earnings` for their earnings, and `list_notifications` for their activity. All tools act as the signed-in KC Earn user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    browseFeedTool,
    listMyVideosTool,
    getWalletSummaryTool,
    listRecentEarningsTool,
    listNotificationsTool,
  ],
});
