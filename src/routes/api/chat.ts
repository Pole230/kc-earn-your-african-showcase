import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { authenticateRequest, KC_EARN_AI_SYSTEM_PROMPT, textOf } from "@/lib/ai-chat.server";

type ChatRequestBody = { messages?: unknown };

// Simple in-memory sliding-window rate limiter per user. This is intentionaly lightweight
// for this demo. In production prefer a shared store (Redis) so limits persist across instances.
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_REQUESTS = 20; // allow 20 requests per user per window

type RateMap = Map<string, number[]>;
declare global {
  // attach to globalThis so state survives module reloads in dev
  var __kcAiRateLimits: RateMap | undefined;
}

if (!globalThis.__kcAiRateLimits) globalThis.__kcAiRateLimits = new Map();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const map = globalThis.__kcAiRateLimits as RateMap;
  const arr = map.get(userId) ?? [];
  // prune old timestamps
  const pruned = arr.filter((t) => t > windowStart);
  pruned.push(now);
  map.set(userId, pruned);
  return pruned.length > RATE_MAX_REQUESTS;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateRequest(request);
          if (!auth) return new Response("Unauthorized", { status: 401 });

          // rate limit check
          if (isRateLimited(auth.userId)) {
            return new Response("Too Many Requests", { status: 429 });
          }

          const body = (await request.json()) as ChatRequestBody;
          const { messages } = body ?? {};

          if (!Array.isArray(messages) || messages.length === 0) {
            return new Response("Messages are required", { status: 400 });
          }

          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            // Server-side logging for operators; do not expose secrets or keys to clients.
            console.error("[kc-earn-ai] missing LOVABLE_API_KEY environment variable");
            return new Response(
              "Server misconfiguration: AI provider not configured. Contact the site operator.",
              { status: 500 },
            );
          }

          const uiMessages = messages as UIMessage[];

          // Ensure there's a conversation for this user — find latest or create one.
          let conversationId: string | null = null;
          try {
            const { data: existingConv, error: convErr } = await (auth.supabase as any)
              .from("ai_conversations")
              .select("id")
              .eq("user_id", auth.userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (convErr) {
              console.error("[kc-earn-ai] error fetching conversation", convErr);
            }

            if (existingConv && (existingConv as any).id) {
              conversationId = (existingConv as any).id;
            } else {
              const { data: newConv, error: insertErr } = await (auth.supabase as any)
                .from("ai_conversations")
                .insert({ user_id: auth.userId, title: null })
                .select("id")
                .maybeSingle();
              if (insertErr) {
                console.error("[kc-earn-ai] failed to create conversation", insertErr);
              } else if (newConv && (newConv as any).id) {
                conversationId = (newConv as any).id;
              }
            }
          } catch (err) {
            console.error("[kc-earn-ai] conversation lookup/create failed", err);
            // continue without conversation id
          }

          // persist the last user message to memory for later analysis
          const last = uiMessages[uiMessages.length - 1];

          if (last?.role === "user") {
            try {
              const insertObj: any = {
                user_id: auth.userId,
                role: "user",
                parts: last.parts as never,
                client_message_id: last.id ?? null,
              };
              if (conversationId) insertObj.conversation_id = conversationId;

              const { error } = await auth.supabase.from("ai_messages").insert(insertObj as any);
              if (error) console.error("[kc-earn-ai] failed to save user message", error);
            } catch (err) {
              console.error("[kc-earn-ai] failed to save user message (exception)", err);
            }
          }

          // Load authenticated creator earnings context for KC AI.
          // Read-only queries only; withdrawal operations are never exposed to the AI.
          let creatorContext = "";
          try {
            const { data: verification } = await (auth.supabase as any)
              .from("account_verifications")
              .select("phone_verified_at,email_verified_at")
              .eq("user_id", auth.userId)
              .maybeSingle();
            const phoneVerified = Boolean(verification?.phone_verified_at);
            const emailVerified = Boolean(verification?.email_verified_at);
            const { data: wallet, error: walletError } = await auth.supabase
              .from("wallets")
              .select("available_balance,pending_balance,lifetime_earned,currency")
              .eq("user_id", auth.userId)
              .maybeSingle();

            if (walletError) {
              console.error("[kc-earn-ai] failed to load wallet", walletError);
            }

            const { data: earnings, error: earningsError } = await auth.supabase
              .from("earnings")
              .select("amount,source,note,created_at")
              .eq("user_id", auth.userId)
              .order("created_at", { ascending: false })
              .limit(20);

            if (earningsError) {
              console.error("[kc-earn-ai] failed to load earnings", earningsError);
            }

            const currency = wallet?.currency ?? "USD";
            const available = Number(wallet?.available_balance ?? 0);
            const pending = Number(wallet?.pending_balance ?? 0);
            const lifetime = Number(wallet?.lifetime_earned ?? 0);

            const recentEarnings = (earnings ?? []).map((row) => ({
              amount: Number(row.amount ?? 0),
              source: row.source,
              note: row.note,
              date: row.created_at,
            }));

            creatorContext = `
AUTHENTICATED CREATOR EARNINGS CONTEXT:
- Verification state: ${phoneVerified && emailVerified ? "FULLY_VERIFIED" : phoneVerified ? "EMAIL_UNVERIFIED" : emailVerified ? "PHONE_UNVERIFIED" : "PARTIALLY_VERIFIED"}
- Phone verified: ${phoneVerified}
- Email verified: ${emailVerified}
- Phone verified: ${Boolean(verification?.phone_verified_at)}
- Email verified: ${Boolean(verification?.email_verified_at)}
- Currency: ${currency}
- Available wallet balance: ${available.toFixed(2)}
- Pending balance: ${pending.toFixed(2)}
- Lifetime earned: ${lifetime.toFixed(2)}
- Recent earnings: ${JSON.stringify(recentEarnings)}

Use these values when the creator asks about their own balance, earnings, or recent earning activity.
These values belong only to the authenticated creator. Never reveal another user's financial information.
Never invent or estimate financial values that are not present in this context.
Do not initiate, approve, or claim to have processed withdrawals.
You may explain which verification step remains and direct the creator to /verification, but you must never mark either method verified, bypass checks, or override OTP validation.
`;
          } catch (err) {
            console.error("[kc-earn-ai] failed to load creator earnings context", err);
          }

          const gateway = createLovableAiGatewayProvider(key);

          const result = streamText({
            model: gateway("google/gemini-3.6-flash"),
            system: `${KC_EARN_AI_SYSTEM_PROMPT}

${creatorContext}`,
            messages: await convertToModelMessages(uiMessages),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: uiMessages,
            onFinish: async ({ responseMessage }) => {
              try {
                if (!responseMessage) return;
                const text = textOf(responseMessage);
                if (!text) return;
                const insertObj: any = {
                  user_id: auth.userId,
                  role: "assistant",
                  parts: responseMessage.parts as never,
                  client_message_id: responseMessage.id ?? null,
                };
                if (conversationId) insertObj.conversation_id = conversationId;

                const { error } = await auth.supabase.from("ai_messages").insert(insertObj as any);
                if (error) console.error("[kc-earn-ai] failed to save assistant message", error);
              } catch (err) {
                console.error("[kc-earn-ai] failed to save assistant message (exception)", err);
              }
            },
          });
        } catch (err) {
          console.error("[kc-earn-ai] handler error", err);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
