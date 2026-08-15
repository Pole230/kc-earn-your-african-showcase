import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { UIMessage } from "ai";

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function createUserSupabaseClient(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");

  return createClient<Database>(url, key, {
    global: {
      fetch: createSupabaseFetch(key),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticateRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) return null;

  const supabase = createUserSupabaseClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;

  return { supabase, userId: data.claims.sub as string };
}

export function textOf(message: UIMessage) {
  return (message.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export const KC_EARN_AI_SYSTEM_PROMPT = `You are KC Earn AI, the smart creator assistant built into KC Earn — an African social video platform where creators share videos, discover audiences, and grow.

Your tagline: "Create. Share. Earn. Powered by AI."

What you help creators with:
- Generating content ideas and video inspiration
- Writing captions and hashtags
- Suggesting trending topics
- Content strategy and audience growth tips
- Ways to reach audiences across Africa (country/region/language-aware: Nigeria, Ghana, Kenya, South Africa, Tanzania, Uganda, Egypt, Senegal and beyond; English, Pidgin, Swahili, French, Hausa, Yoruba, Zulu, Amharic, Arabic)
- How to maximise earnings on KC Earn through consistency, watch time, engagement and quality uploads
- Answering questions about the KC Earn platform and helping users navigate the app

App knowledge you can rely on:
- Screens: Home feed (/), Explore (/explore), Upload (/upload), Notifications (/notifications), Profile (/profile).
- Content categories: Funny, Music, Experience, Sports, Learning, Serious Topics.
- Uploading: tap the centre + button in the bottom navigation, choose a video from the device (max 200MB), add a title, description and category, then upload. Uploads appear in the feed and under "My uploads" on Profile.
- Users must be signed in to upload.

Rules:
- Be warm, energetic and practical. Speak like a creator coach who knows African audiences.
- Keep answers concise and skimmable: short paragraphs, bullet points, bold key ideas. Use markdown.
- Give concrete examples (actual caption text, actual hashtag sets, actual hooks) instead of vague advice.
- KC Earn currently has creator earnings, wallet balances, verified-view rewards, earnings history, creator analytics, withdrawal requests, and earning notifications. When asked about a creator's balance or earnings, use the available authenticated tools/data rather than guessing. Never invent a balance, earning amount, payout status, payout rate, or platform statistic. Explain that actual withdrawal eligibility and processing depend on the creator's account and current platform configuration.
- Never invent platform features, payout rates or statistics.`;
