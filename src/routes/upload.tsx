import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, Film, Info, LogIn } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { probeVideoFile } from "@/lib/video-probe";
import type { Category } from "@/data/content";
import type { Video } from "@/types/video";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload a Video — KC Earn" },
      {
        name: "description",
        content:
          "Share your video with the KC Earn community: add a title, description and category.",
      },
      { property: "og:title", content: "Upload a Video — KC Earn" },
      { property: "og:description", content: "Publish your story to the KC Earn community." },
    ],
  }),
  component: Upload,
});

const MAX_BYTES = 200 * 1024 * 1024;

function Upload() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<Category>("Funny");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string | null; duration: number; blob: Blob | null } | null>(
    null,
  );
  const [progressText, setProgressText] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<
    "idle" | "uploading" | "uploading-thumb" | "publishing" | "done" | "error"
  >("idle");

  // Fake progress updater to give user feedback while upload is in flight.
  // It will increase up to 90% and wait for the real upload to finish.
  useEffect(() => {
    let timer: number | undefined;
    if (uploadStage === "uploading") {
      setProgressPercent(5);
      timer = window.setInterval(() => {
        setProgressPercent((p) => {
          if (p === null) return 5;
          const next = Math.min(90, p + Math.max(1, Math.round((100 - p) * 0.05)));
          return next;
        });
      }, 700);
    }
    if (uploadStage === "uploading-thumb") {
      setProgressPercent(92);
    }
    if (uploadStage === "publishing") {
      setProgressPercent(96);
    }
    if (uploadStage === "done") {
      setProgressPercent(100);
      timer = window.setTimeout(() => setProgressPercent(null), 700);
    }
    if (uploadStage === "error") {
      setProgressPercent(null);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [uploadStage]);

  async function onPick(selected: File | undefined) {
    if (!selected) return;
    if (!selected.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    if (selected.size > MAX_BYTES) {
      toast.error("Video is too large", { description: "Maximum size is 200MB." });
      return;
    }
    setFile(selected);
    setPreview(null);
    try {
      const probe = await probeVideoFile(selected);
      setPreview({
        url: probe.thumbnailPreview,
        duration: probe.durationSeconds,
        blob: probe.thumbnailBlob,
      });
    } catch (err) {
      console.error("probeVideoFile failed", err);
      toast.error("Could not read video metadata");
    }
  }

  async function publish() {
    if (!user || !file) return;
    setUploadStage("uploading");
    setProgressText("Uploading video…");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const videoPath = `${user.id}/${stamp}.${ext}`;

      // Upload video
      const { error: videoError } = await supabase.storage
        .from("videos")
        .upload(videoPath, file, { contentType: file.type, upsert: false });
      if (videoError) throw videoError;

      setUploadStage("uploading-thumb");
      setProgressText("Uploading cover image…");

      let thumbnailPath: string | null = null;
      if (preview?.blob) {
        thumbnailPath = `${user.id}/${stamp}.jpg`;
        const { error: thumbError } = await supabase.storage
          .from("thumbnails")
          .upload(thumbnailPath, preview.blob, { contentType: "image/jpeg", upsert: false });
        if (thumbError) {
          // Log the thumbnail error but continue — thumbnail is optional
          console.error("thumbnail upload failed", thumbError);
          thumbnailPath = null;
        }
      }

      setUploadStage("publishing");
      setProgressText("Publishing…");

      // Insert video record. Use Database-generated typing for the insert payload; store only permanent storage paths.
      const { data: inserted, error: insertError } = await supabase
        .from("videos")
        .insert<Database['public']['Tables']['videos']['Insert']>([
          {
            user_id: user.id,
            title: title.trim(),
            description: description.trim() || null,
            category,
            video_path: videoPath,
            thumbnail_path: thumbnailPath,
            duration_seconds: preview?.duration ?? null,
            status: "processing", // set to processing so a background job can transcode/validate
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      // Refresh feed queries
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      await queryClient.invalidateQueries({ queryKey: ["my-videos"] });

      setUploadStage("done");
      setProgressText(null);

      toast.success("Upload saved", { description: "Your video is being processed and will appear shortly." });

      // reset form
      setFile(null);
      setPreview(null);
      setTitle("");
      setDescription("");

      // Navigate to home or video page
      navigate({ to: "/" });
    } catch (err) {
      console.error("Upload failed", err);
      setUploadStage("error");
      setProgressText(null);
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Upload failed", { description: message ?? "Please try again." });
    }
  }

  if (!loading && !user) {
    return (
      <div className="px-5 pb-4 sm:px-8">
        <ScreenHeader title="Upload" subtitle="Share a story with the community" />
        <div className="rounded-3xl border border-border bg-surface p-8 text-center">
          <span className="gradient-brand mx-auto grid size-14 place-items-center rounded-2xl text-brand-foreground">
            <LogIn className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Sign in to upload</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You need a creator account to publish videos on KC Earn.
          </p>
          <Link
            to="/auth"
            className="gradient-brand mt-6 inline-flex w-full items-center justify-center rounded-2xl py-3.5 text-base font-bold text-brand-foreground shadow-lift"
          >
            Sign in or create account
          </Link>
        </div>
      </div>
    );
  }

  const busy = uploadStage !== "idle" && uploadStage !== "done";

  return (
    <div className="px-5 pb-4 sm:px-8">
      <ScreenHeader title="Upload" subtitle="Share a story with the community" />

      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border border-dashed border-brand/40 bg-gradient-to-b from-surface to-background px-6 py-10 text-center shadow-lift transition-colors hover:border-brand">
        {preview?.url ? (
          <img
            src={preview.url}
            alt="Selected video cover"
            className="h-40 w-full rounded-2xl object-cover"
          />
        ) : (
          <span className="gradient-brand grid size-14 place-items-center rounded-2xl text-brand-foreground">
            <UploadCloud className="size-7" />
          </span>
        )}
        <span className="line-clamp-1 text-base font-semibold">{file?.name ?? "Select a video to upload"}</span>
        <span className="text-xs text-muted-foreground">MP4 or MOV · up to 200MB</span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-semibold">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Give your video a clear title"
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-brand"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{title.length}/100</p>
        </div>

        <div>
          <label htmlFor="description" className="mb-2 block text-sm font-semibold">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={600}
            placeholder="Tell viewers what this is about"
            className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-brand"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Category</p>
          <CategoryChips
            active={category}
            onSelect={(value) => setCategory(value as Category)}
            includeAll={false}
          />
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-xs text-muted-foreground">
            Keep content original and respectful. You can delete your video any time from your
            profile.
          </p>
        </div>

        {progressPercent !== null ? (
          <div className="w-full">
            <div className="mb-2 text-xs text-muted-foreground">{progressText ?? "Uploading..."}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-brand"
                style={{ width: `${progressPercent}%`, transition: 'width 400ms linear' }}
              />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!file || title.trim() === "" || busy}
          onClick={publish}
          className="gradient-brand flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-brand-foreground shadow-lift transition-transform active:scale-[0.99] disabled:opacity-40"
        >
          <Film className="size-5" /> {progressText ?? "Publish video"}
        </button>
      </div>
    </div>
  );
}
