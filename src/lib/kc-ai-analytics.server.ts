import { convertToModelMessages, streamText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { textOf } from "@/lib/ai-chat.server";

type AnalyticsRow = {
  id: string;
  user_id: string;
  video_id: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time: number;
  completion_rate: number;
  created_at: string;
};

export function analyzeVideoPerformance(rows: AnalyticsRow[]) {
  // basic aggregations and heuristics
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const totalLikes = rows.reduce((s, r) => s + (r.likes || 0), 0);
  const totalComments = rows.reduce((s, r) => s + (r.comments || 0), 0);
  const totalShares = rows.reduce((s, r) => s + (r.shares || 0), 0);
  const totalWatchTime = rows.reduce((s, r) => s + (r.watch_time || 0), 0);
  const avgCompletion =
    rows.length === 0 ? 0 : rows.reduce((s, r) => s + Number(r.completion_rate || 0), 0) / rows.length;

  const engagementRate = totalViews > 0 ? (totalLikes + totalComments + totalShares) / totalViews : 0;
  const likesPerComment = totalComments > 0 ? totalLikes / totalComments : totalLikes;
  const avgWatchPerView = totalViews > 0 ? totalWatchTime / totalViews : 0;

  // identify weak points per-video
  const weakPoints: string[] = [];
  rows.forEach((r) => {
    if (r.views > 0 && r.completion_rate < 0.2) {
      weakPoints.push(`Video ${r.video_id ?? r.id} has low completion (${r.completion_rate}).`);
    }
    if (r.views > 0 && r.watch_time / Math.max(1, r.views) < 5) {
      weakPoints.push(`Video ${r.video_id ?? r.id} average watch per view is low (${Math.round(
        (r.watch_time || 0) / Math.max(1, r.views),
      )}s).`);
    }
  });

  const summary = {
    totalViews,
    totalLikes,
    totalComments,
    totalShares,
    totalWatchTime,
    avgCompletion: Number(avgCompletion.toFixed(3)),
    engagementRate: Number(engagementRate.toFixed(3)),
    likesPerComment: Number(likesPerComment.toFixed(2)),
    avgWatchPerView: Math.round(avgWatchPerView),
    weakPoints,
  };

  return summary;
}

export function buildAnalyticsPrompt(summary: ReturnType<typeof analyzeVideoPerformance>, rows: AnalyticsRow[], focus?: string | null) {
  const lines: string[] = [];
  lines.push("You are an analytics assistant for a short-form video creator on KC Earn.");
  lines.push("Provide concise, actionable recommendations.");
  lines.push(`Total views: ${summary.totalViews}`);
  lines.push(`Total likes: ${summary.totalLikes}`);
  lines.push(`Total comments: ${summary.totalComments}`);
  lines.push(`Total shares: ${summary.totalShares}`);
  lines.push(`Average completion rate: ${summary.avgCompletion}`);
  lines.push(`Engagement rate (likes+comments+shares / views): ${summary.engagementRate}`);
  lines.push(`Average watch time per view (seconds): ${summary.avgWatchPerView}`);
  if (summary.weakPoints.length > 0) {
    lines.push(`Observed weak points:`);
    summary.weakPoints.forEach((w) => lines.push(`- ${w}`));
  }
  if (focus) lines.push(`Focus: ${focus}`);
  lines.push(
    "Provide: 1) Key strengths; 2) Weak points and root causes; 3) Concrete experiments to try next (content ideas + structure); 4) Quick hooks to test; 5) Metrics to track.",
  );

  // include a short per-video table for context
  lines.push("Per-video summary (id: views / completion / watch_time):");
  rows.slice(0, 10).forEach((r) => {
    lines.push(`${r.video_id ?? r.id}: ${r.views} views / ${r.completion_rate} completion / ${r.watch_time}s watch`);
  });

  return lines.join("\n");
}

export async function generateAnalyticsAiResponse(key: string | undefined, summary: ReturnType<typeof analyzeVideoPerformance>, rows: AnalyticsRow[], focus?: string | null) {
  if (!key) throw new Error("Missing AI provider key");
  const prompt = buildAnalyticsPrompt(summary, rows, focus ?? null);
  const gateway = createLovableAiGatewayProvider(key);
  const result = streamText({
    model: gateway("google/gemini-3.6-flash"),
    system: "You are KC Earn Analytics Assistant. Keep answers short and actionable.",
    messages: await convertToModelMessages([
      { id: `analytics-${Date.now()}`, role: "user", parts: [{ type: "text", text: prompt }] },
    ]),
  });
  return result;
}
