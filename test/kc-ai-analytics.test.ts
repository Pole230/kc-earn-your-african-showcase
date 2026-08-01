import { describe, it, expect, vi } from "vitest";
import { analyzeVideoPerformance, buildAnalyticsPrompt } from "@/lib/kc-ai-analytics.server";

describe("kc-ai-analytics", () => {
  it("calculates summary metrics", () => {
    const rows = [
      { id: "1", user_id: "u", video_id: "v1", views: 100, likes: 10, comments: 2, shares: 1, watch_time: 500, completion_rate: 0.4, created_at: new Date().toISOString() },
      { id: "2", user_id: "u", video_id: "v2", views: 50, likes: 2, comments: 5, shares: 0, watch_time: 200, completion_rate: 0.1, created_at: new Date().toISOString() },
    ];
    const summary = analyzeVideoPerformance(rows as any);
    expect(summary.totalViews).toBe(150);
    expect(summary.totalLikes).toBe(12);
    expect(typeof summary.engagementRate).toBe("number");
    expect(Array.isArray(summary.weakPoints)).toBe(true);
  });

  it("builds a prompt containing key metrics", () => {
    const rows = [
      { id: "1", user_id: "u", video_id: "v1", views: 100, likes: 10, comments: 2, shares: 1, watch_time: 500, completion_rate: 0.4, created_at: new Date().toISOString() },
    ];
    const summary = analyzeVideoPerformance(rows as any);
    const prompt = buildAnalyticsPrompt(summary as any, rows as any, "grow audience");
    expect(prompt).toContain("Total views:");
    expect(prompt).toContain("Focus: grow audience");
  });
});
