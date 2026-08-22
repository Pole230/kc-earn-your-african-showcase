import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const processUploadedVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { videoId: string }) => input)
  .handler(async ({ context, data }) => {
    const { data: video, error } = await context.supabase
      .from("videos")
      .select("id, user_id, status")
      .eq("id", data.videoId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!video) throw new Error("Upload not found");
    if (video.status === "published") return { status: "published" as const };

    const { processVideo } = await import("@/integrations/video/worker");
    await processVideo(video.id);
    return { status: "published" as const };
  });
