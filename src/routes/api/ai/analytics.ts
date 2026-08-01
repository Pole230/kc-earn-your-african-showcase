import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { authenticateRequest, KC_EARN_AI_SYSTEM_PROMPT, textOf } from "@/lib/ai-chat.server";
import { analyzeVideoPerformance, generateAnalyticsAiResponse } from "@/lib/kc-ai-analytics.server";

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 10;

type RateMap = Map<string, number[]>;
declare global {
  var __kcAiAnalyticsRateLimits: RateMap | undefined;
}
if (!globalThis.__kcAiAnalyticsRateLimits) globalThis.__kcAiAnalyticsRateLimits = new Map();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const map = globalThis.__kcAiAnalyticsRateLimits as RateMap;
  const arr = map.get(userId) ?? [];
  const pruned = arr.filter((t) => t > windowStart);
  pruned.push(now);
  map.set(userId, pruned);
  return pruned.length > RATE_MAX_REQUESTS;
}

export const Route = createFileRoute("/api/ai/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateRequest(request);
          if (!auth) return new Response("Unauthorized", { status: 401 });

          // Simple aggregation of analytics rows for user
          const { data, error } = await auth.supabase
            .from("ai_creator_analytics")
            .select(
              "id,video_id,views,likes,comments,shares,watch_time,completion_rate,created_at",
            )
            .eq("user_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(200);

          if (error) {
            console.error("[kc-earn-ai] analytics query failed", error);
            return new Response("Failed to load analytics", { status: 500 });
          }

          // Compute summary
          const rows = (data ?? []) as any[];
          const summary = analyzeVideoPerformance(
            rows.map((r) => ({
              id: r.id,
              user_id: auth.userId,
              video_id: r.video_id,
              views: Number(r.views || 0),
              likes: Number(r.likes || 0),
              comments: Number(r.comments || 0),
              shares: Number(r.shares || 0),
              watch_time: Number(r.watch_time || 0),
              completion_rate: Number(r.completion_rate || 0),
              created_at: r.created_at,
            })),
          );

          return new Response(JSON.stringify({ summary, rows }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[kc-earn-ai] analytics GET error", err);
          return new Response("Internal Server Error", { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const auth = await authenticateRequest(request);
          if (!auth) return new Response("Unauthorized", { status: 401 });

          if (isRateLimited(auth.userId)) return new Response("Too Many Requests", { status: 429 });

          const body = (await request.json()) as { video_id?: string; focus?: string };

          const { data, error } = await auth.supabase
            .from("ai_creator_analytics")
            .select("id,video_id,views,likes,comments,shares,watch_time,completion_rate,created_at")
            .eq("user_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(200);

          if (error) {
            console.error("[kc-earn-ai] analytics query failed", error);
            return new Response("Failed to load analytics", { status: 500 });
          }

          const rows = (data ?? []) as any[];
          const mapped = rows.map((r) => ({
            id: r.id,
            user_id: auth.userId,
            video_id: r.video_id,
            views: Number(r.views || 0),
            likes: Number(r.likes || 0),
            comments: Number(r.comments || 0),
            shares: Number(r.shares || 0),
            watch_time: Number(r.watch_time || 0),
            completion_rate: Number(r.completion_rate || 0),
            created_at: r.created_at,
          }));

          const summary = analyzeVideoPerformance(mapped);

          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            console.error("[kc-earn-ai] missing LOVABLE_API_KEY");
            return new Response("Server misconfiguration: AI provider not configured.", { status: 500 });
          }

          const result = await generateAnalyticsAiResponse(key, summary, mapped, body?.focus ?? null);

          // create/find conversation and persist user message
          let conversationId: string | null = null;
          try {
            const { data: existingConv, error: convErr } = await auth.supabase
              .from("ai_conversations")
              .select("id")
              .eq("user_id", auth.userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (convErr) console.error("[kc-earn-ai] conv lookup error", convErr);
            if (existingConv && (existingConv as any).id) conversationId = (existingConv as any).id;
            else {
              const { data: newConv, error: insertErr } = await auth.supabase
                .from("ai_conversations")
                .insert({ user_id: auth.userId, title: "Performance analysis" })
                .select("id")
                .maybeSingle();
              if (insertErr) console.error("[kc-earn-ai] create conv error", insertErr);
              else if (newConv && (newConv as any).id) conversationId = (newConv as any).id;
            }
          } catch (err) {
            console.error("[kc-earn-ai] conv error", err);
          }

          const userMsg = { id: `analytics-${Date.now()}`, role: "user", parts: [{ type: "text", text: `Analyze my performance${body?.video_id ? ` for video ${body.video_id}` : ""}` }] } as UIMessage;

          try {
            const insertObj: any = {
              user_id: auth.userId,
              role: "user",
              parts: userMsg.parts as never,
              client_message_id: userMsg.id ?? null,
            };
            if (conversationId) insertObj.conversation_id = conversationId;
            const { error: insertErr } = await auth.supabase.from("ai_messages").insert(insertObj as any);
            if (insertErr) console.error("[kc-earn-ai] failed to save analytics user message", insertErr);
          } catch (err) {
            console.error("[kc-earn-ai] exception saving analytics user message", err);
          }

          return result.toUIMessageStreamResponse({
            originalMessages: [userMsg],
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
                const { error: insErr } = await auth.supabase.from("ai_messages").insert(insertObj as any);
                if (insErr) console.error("[kc-earn-ai] failed to save analytics assistant message", insErr);
              } catch (err) {
                console.error("[kc-earn-ai] failed to save analytics assistant message (exception)", err);
              }
            },
          });
        } catch (err) {
          console.error("[kc-earn-ai] analytics POST error", err);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
