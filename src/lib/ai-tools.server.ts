import { type UIMessage } from "ai";

export type ToolInput = Record<string, unknown>;

export function buildTitlePrompt(input: {
  topic: string;
  category?: string | null;
  audience?: string | null;
  language?: string | null;
}) {
  const { topic, category, audience, language } = input;
  const lines = [
    `Generate 8 video titles for the following video topic:`,
    `Topic: ${topic}`,
  ];
  if (category) lines.push(`Category: ${category}`);
  if (audience) lines.push(`Audience: ${audience}`);
  if (language) lines.push(`Language: ${language}`);
  lines.push(
    `Provide a mix of catchy, viral-style, professional and SEO-friendly titles. Number each title and keep them concise (max 10 words).`,
  );
  return lines.join("\n");
}

export function buildCaptionPrompt(input: {
  description: string;
  mood?: string | null;
  style?: string | null;
}) {
  const { description, mood, style } = input;
  const lines = [
    `Create 4 caption variations for this video description:`,
    `Description: ${description}`,
  ];
  if (mood) lines.push(`Mood: ${mood}`);
  if (style) lines.push(`Platform style: ${style}`);
  lines.push(
    `Return: short caption (1-2 lines), long caption (2-3 sentences), emoji-only version, and call-to-action version. Keep local audience and languages in mind when relevant.`,
  );
  return lines.join("\n");
}

export function buildHashtagsPrompt(input: {
  topic?: string | null;
  category?: string | null;
  audience?: string | null;
  region?: string | null;
}) {
  const { topic, category, audience, region } = input;
  const lines = [
    `Generate hashtag groups for this video.`,
  ];
  if (topic) lines.push(`Topic: ${topic}`);
  if (category) lines.push(`Category: ${category}`);
  if (audience) lines.push(`Audience: ${audience}`);
  if (region) lines.push(`Region/Audience focus: ${region}`);
  lines.push(
    `Output three groups: Primary hashtags (3-5), Community hashtags (4-8), Discovery hashtags (6-20). Prefer local languages and continent-specific tags for African audiences.`,
  );
  return lines.join("\n");
}

export function buildCoachPrompt(input: {
  focus?: string | null;
  platform?: string | null;
  goals?: string | null;
}) {
  const { focus, platform, goals } = input;
  const lines = [
    `You are a creator coach. Provide actionable advice.`,
  ];
  if (focus) lines.push(`Focus: ${focus}`);
  if (platform) lines.push(`Platform style: ${platform}`);
  if (goals) lines.push(`Goals: ${goals}`);
  lines.push(
    `Provide a short plan: posting cadence, hooks, engagement tactics, content ideas, metrics to track. Use bullets and short examples. Tailor suggestions to African creator audiences where relevant.`,
  );
  return lines.join("\n");
}

export function uiMessageFromText(text: string): UIMessage[] {
  return [
    {
      id: `tool-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text }],
    },
  ];
}
