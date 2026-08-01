import { createFileRoute } from "@tanstack/react-router";
import { processVideo } from "@/integrations/video/worker";

export const Route = createFileRoute("/api/videos/trigger-process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-process-secret") || process.env.PROCESS_TRIGGER_SECRET;
        if (!secret) return new Response("Trigger secret not configured", { status: 500 });
        const header = request.headers.get("x-process-secret");
        if (!header || header !== secret) return new Response("Forbidden", { status: 403 });

        const body = await request.json().catch(() => ({}));
        const videoId = body && (body.videoId || body.video_id || body.id);
        if (!videoId) return new Response("videoId is required", { status: 400 });

        try {
          await processVideo(String(videoId));
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
        } catch (err) {
          console.error("trigger-process failed", err);
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
