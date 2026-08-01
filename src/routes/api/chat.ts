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
          if (!key) return new Response("AI is not configured", { status: 500 });

          const uiMessages = messages as UIMessage[];

          // persist the last user message to memory for later analysis
          const last = uiMessages[uiMessages.length - 1];

          if (last?.role === "user") {
            try {
              const { error } = await auth.supabase.from("ai_messages").insert({
                user_id: auth.userId,
                role: "user",
                parts: last.parts as never,
                client_message_id: last.id ?? null,
              });
              if (error) console.error("[kc-earn-ai] failed to save user message", error);
            } catch (err) {
              console.error("[kc-earn-ai] failed to save user message (exception)", err);
            }
          }

          const gateway = createLovableAiGatewayProvider(key);

          const result = streamText({
            model: gateway("google/gemini-3.6-flash"),
            system: KC_EARN_AI_SYSTEM_PROMPT,
            messages: await convertToModelMessages(uiMessages),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: uiMessages,
            onFinish: async ({ responseMessage }) => {
              try {
                if (!responseMessage) return;
                const text = textOf(responseMessage);
                if (!text) return;
                const { error } = await auth.supabase.from("ai_messages").insert({
                  user_id: auth.userId,
                  role: "assistant",
                  parts: responseMessage.parts as never,
                  client_message_id: responseMessage.id ?? null,
                });
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
