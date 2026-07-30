import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { authenticateRequest, KC_EARN_AI_SYSTEM_PROMPT, textOf } from "@/lib/ai-chat.server";

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("AI is not configured", { status: 500 });

        const uiMessages = messages as UIMessage[];
        const last = uiMessages[uiMessages.length - 1];

        if (last?.role === "user") {
          const { error } = await auth.supabase.from("ai_messages").insert({
            user_id: auth.userId,
            role: "user",
            parts: last.parts as never,
            client_message_id: last.id ?? null,
          });
          if (error) console.error("[kc-earn-ai] failed to save user message", error);
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
          },
        });
      },
    },
  },
});
