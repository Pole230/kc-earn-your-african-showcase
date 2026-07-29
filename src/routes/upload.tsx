import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UploadCloud, Film, Info } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CategoryChips } from "@/components/CategoryChips";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload a Video — KC Earn" },
      {
        name: "description",
        content: "Share your video with the KC Earn community: add a title, description and category.",
      },
      { property: "og:title", content: "Upload a Video — KC Earn" },
      { property: "og:description", content: "Publish your story to the KC Earn community." },
    ],
  }),
  component: Upload,
});

function Upload() {
  const [category, setCategory] = useState("Funny");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="px-5 pb-4">
      <ScreenHeader title="Upload" subtitle="Share a story with the community" />

      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <span className="gradient-brand grid size-14 place-items-center rounded-2xl text-brand-foreground">
          <UploadCloud className="size-7" />
        </span>
        <span className="text-base font-semibold">
          {fileName ?? "Select a video to upload"}
        </span>
        <span className="text-xs text-muted-foreground">MP4 or MOV · up to 10 minutes</span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
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
            placeholder="Tell viewers what this is about"
            className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-brand"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Category</p>
          <CategoryChips active={category} onSelect={setCategory} includeAll={false} />
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-xs text-muted-foreground">
            Uploads go through community review. Keep content original and respectful.
          </p>
        </div>

        <button
          type="button"
          disabled={!fileName || title.trim() === ""}
          onClick={() => toast.success("Upload queued", { description: "We'll notify you when it's live." })}
          className="gradient-brand flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-brand-foreground shadow-lift disabled:opacity-40"
        >
          <Film className="size-5" /> Publish video
        </button>
      </div>
    </div>
  );
}
