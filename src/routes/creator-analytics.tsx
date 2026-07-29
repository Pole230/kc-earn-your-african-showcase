import { createFileRoute, Link } from "@tanstack/react-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useCreatorEarnings } from "@/hooks/useCreatorEarnings";
import { useCreatorAnalytics } from "@/hooks/useCreatorAnalytics";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/creator-analytics")({
  head: () => ({
    meta: [{ title: "Creator Analytics — KC Earn" }],
  }),
  component: CreatorAnalyticsPage,
});

function StatCard({ label, value, loading }: { label: string; value: string | number; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{loading ? "…" : value}</p>
    </div>
  );
}

function EarningRow({ item, thumbUrl }: { item: any; thumbUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <img src={thumbUrl ?? ""} alt="thumb" className="h-16 w-20 rounded-lg object-cover" />
      <div className="flex-1">
        <div className="text-sm font-semibold">{item.video_title ?? "Unknown video"}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {item.earning_type} · ${Number(item.amount).toFixed(2)} · {item.status}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
    </div>
  );
}

export default function CreatorAnalyticsPage() {
  const earnings = useCreatorEarnings();
  const analytics = useCreatorAnalytics();

  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const recent = earnings.recent;

  useEffect(() => {
    async function loadThumbs() {
      setLoadingThumbs(true);
      try {
        const videoIds = recent.map((r) => r.video_id).filter(Boolean);
        if (videoIds.length === 0) return;

        // fetch video rows for thumbnail_path and title
        const { data: vids, error: vErr } = await supabase.from("videos").select("id,thumbnail_path,title").in("id", videoIds);
        if (vErr) throw vErr;

        const paths = (vids ?? []).map((v: any) => v.thumbnail_path).filter((p: any) => !!p);
        const map = new Map<string, string>();
        if (paths.length > 0) {
          const { data } = await supabase.storage.from("thumbnails").createSignedUrls(paths, 60 * 60);
          data?.forEach((it) => {
            if (it.path && it.signedUrl) map.set(it.path, it.signedUrl);
          });
        }

        const thumbRecord: Record<string, string | null> = {};
        (vids ?? []).forEach((v: any) => {
          thumbRecord[v.id] = v.thumbnail_path ? map.get(v.thumbnail_path) ?? null : null;
        });

        // attach video title into each earning item for display
        const enriched = (recent ?? []).map((r: any) => {
          const match = (vids ?? []).find((v: any) => v.id === r.video_id);
          return { ...r, video_title: match?.title ?? "Unknown video" };
        });

        // update thumbs and replace recent items (note: we do not mutate the hook data)
        setThumbs(thumbRecord);
        // replace recent (local) with enriched — but keep earnings.recent intact; we'll map on render
        // store enriched in a ref or local state if needed
        // for simplicity, we leave earnings.recent as-is and read titles from enriched when rendering
        // but we need to keep enriched for rendering — set local state
        setEnriched(enriched);
      } catch (err) {
        console.error("Failed to load thumbnails for recent earnings", err);
      } finally {
        setLoadingThumbs(false);
      }
    }

    if (recent && recent.length > 0) loadThumbs();
  }, [recent]);

  const [enriched, setEnriched] = useState<any[]>([]);

  return (
    <div className="px-5 pb-6">
      <ScreenHeader title="Creator Analytics" subtitle="Overview of your earnings and performance" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Earnings" value={`$${earnings.total.toFixed ? earnings.total.toFixed(2) : earnings.total}`} loading={earnings.totalLoading} />
        <StatCard label="Monthly Earnings" value={`$${earnings.monthly.toFixed ? earnings.monthly.toFixed(2) : earnings.monthly}`} loading={earnings.monthlyLoading} />
        <StatCard label="Total Views" value={analytics.totalViews} loading={analytics.totalViewsLoading} />
        <StatCard label="Total Likes" value={analytics.totalLikes} loading={analytics.totalLikesLoading} />
        <StatCard label="Total Comments" value={analytics.totalComments} loading={analytics.totalCommentsLoading} />
        <StatCard label="Followers Growth" value={`${Math.round(analytics.followers.percentChange ?? 0)}%`} loading={analytics.followersLoading} />
      </div>

      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold">Top Performing Videos</h3>
        {analytics.topLoading ? (
          <div className="rounded-2xl border border-border bg-surface p-4">Loading top videos…</div>
        ) : analytics.topVideos.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">No videos yet</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {analytics.topVideos.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                <img src={v.thumbnail_path ?? ""} alt={v.title} className="h-16 w-20 rounded-lg object-cover" />
                <div>
                  <div className="text-sm font-semibold">{v.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {v.views_count} views · {v.likes_count} likes · {v.comments_count} comments
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold">Recent Earnings</h3>
        {earnings.recentLoading ? (
          <div className="rounded-2xl border border-border bg-surface p-4">Loading recent earnings…</div>
        ) : (enriched ?? []).length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">No earnings yet</div>
        ) : (
          <div className="space-y-3">
            {enriched.map((it) => (
              <EarningRow key={it.id} item={it} thumbUrl={thumbs[it.video_id] ?? null} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 text-center">
        <Link to="/" className="text-sm text-muted-foreground">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
