import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  authenticateRequest,
  KC_EARN_AI_SYSTEM_PROMPT,
  textOf,
} from "@/lib/ai-chat.server";
import {
  buildTitlePrompt,
  buildCaptionPrompt,
  buildHashtagsPrompt,
  buildCoachPrompt,
  uiMessageFromText,
} from "@/lib/ai-tools.server";

type ToolBody = Record<string, unknown>;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 15;

type RateMap = Map<string, number[]>;
declare global {
  var __kcAiToolRateLimits: RateMap | undefined;
}
if (!globalThis.__kcAiToolRateLimits) globalThis.__kcAiToolRateLimits = new Map();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const map = globalThis.__kcAiToolRateLimits as RateMap;
  const arr = map.get(userId) ?? [];
  const pruned = arr.filter((t) => t > windowStart);
  pruned.push(now);
  map.set(userId, pruned);
  return pruned.length > RATE_MAX_REQUESTS;
}

async function handleTool(
  request: Request,
  tool: "title" | "caption" | "hashtags" | "coach",
) {
  const auth = await authenticateRequest(request);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (isRateLimited(auth.userId)) return new Response("Too Many Requests", { status: 429 });

  const body = (await request.json()) as ToolBody;

  let prompt = "";
  let userMessageText = "";

  try {
    switch (tool) {
      case "title": {
        const topic = String(body.topic ?? "");
        const category = body.category ? String(body.category) : null;
        const audience = body.audience ? String(body.audience) : null;
        const language = body.language ? String(body.language) : null;
        prompt = buildTitlePrompt({ topic, category, audience, language });
        userMessageText = `Generate titles for: ${topic}`;
        break;
      }
      case "caption": {
        const description = String(body.description ?? "");
        const mood = body.mood ? String(body.mood) : null;
        const style = body.style ? String(body.style) : null;
        prompt = buildCaptionPrompt({ description, mood, style });
        userMessageText = `Generate captions: ${description}`;
        break;
      }
      case "hashtags": {
        const topic = body.topic ? String(body.topic) : null;
        const category = body.category ? String(body.category) : null;
        const audience = body.audience ? String(body.audience) : null;
        const region = body.region ? String(body.region) : null;
        prompt = buildHashtagsPrompt({ topic, category, audience, region });
        userMessageText = `Generate hashtags`;
        break;
      }
      case "coach": {
        const focus = body.focus ? String(body.focus) : null;
        const platform = body.platform ? String(body.platform) : null;
        const goals = body.goals ? String(body.goals) : null;
        prompt = buildCoachPrompt({ focus, platform, goals });
        userMessageText = `Creator coach request`;
        break;
      }
    }
  } catch (err) {
    console.error("[kc-earn-ai] invalid tool input", err);
    return new Response("Bad Request", { status: 400 });
  }

  // persist user message
  // create/find conversation
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
        .insert({ user_id: auth.userId, title: null })
        .select("id")
        .maybeSingle();
      if (insertErr) console.error("[kc-earn-ai] create conv error", insertErr);
      else if (newConv && (newConv as any).id) conversationId = (newConv as any).id;
    }
  } catch (err) {
    console.error("[kc-earn-ai] conv error", err);
  }

  const uiMessages = uiMessageFromText(prompt);

  // save user message
  try {
    const insertObj: any = {
      user_id: auth.userId,
      role: "user",
      parts: uiMessages[0].parts as never,
      client_message_id: uiMessages[0].id ?? null,
    };
    if (conversationId) insertObj.conversation_id = conversationId;
    const { error } = await auth.supabase.from("ai_messages").insert(insertObj as any);
    if (error) console.error("[kc-earn-ai] failed to save tool user message", error);
  } catch (err) {
    console.error("[kc-earn-ai] exception saving tool user message", err);
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("[kc-earn-ai] missing LOVABLE_API_KEY");
    return new Response("Server misconfiguration: AI provider not configured.", { status: 500 });
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
        const insertObj: any = {
          user_id: auth.userId,
          role: "assistant",
          parts: responseMessage.parts as never,
          client_message_id: responseMessage.id ?? null,
        };
        if (conversationId) insertObj.conversation_id = conversationId;
        const { error } = await auth.supabase.from("ai_messages").insert(insertObj as any);
        if (error) console.error("[kc-earn-ai] failed to save tool assistant message", error);
      } catch (err) {
        console.error("[kc-earn-ai] failed to save tool assistant message (exception)", err);
      }
    },
  });
}

export const Route = createFileRoute("/api/ai/tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const pathname = url.pathname;
        if (pathname.endsWith("/title")) return handleTool(request, "title");
        if (pathname.endsWith("/caption")) return handleTool(request, "caption");
        if (pathname.endsWith("/hashtags")) return handleTool(request, "hashtags");
        if (pathname.endsWith("/coach")) return handleTool(request, "coach");
        return new Response("Not Found", { status: 404 });
      },
    },
  },
});
