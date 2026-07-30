import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/ai-chat.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type UploadBody = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  video_path: string;
  thumbnail_path?: string | null;
  duration_seconds?: number | null;
  status?: "processing" | "published" | "removed" | string | null;
};

export const Route = createFileRoute("/api/videos/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        let body: UploadBody;
        try {
          body = (await request.json()) as UploadBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (!body?.video_path) {
          return new Response("video_path is required", { status: 400 });
        }

        const row = {
          user_id: auth.userId,
          title: (body.title ?? "").trim() || null,
          description: (body.description ?? "").trim() || null,
          category: body.category ?? null,
          video_path: body.video_path,
          thumbnail_path: body.thumbnail_path ?? null,
          duration_seconds: body.duration_seconds ?? null,
          status: body.status ?? "processing",
        };

        try {
          const { data, error } = await supabaseAdmin.from("videos").insert(row).select().single();
          if (error) {
            console.error("[videos/upload] insert error", error);
            return new Response("Database insert failed", { status: 500 });
          }
          return new Response(JSON.stringify({ video: data }), {
            status: 201,
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          console.error("[videos/upload] unexpected error", err);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
