import { describe, expect, it } from "vitest";
import { identifyVideoSource, sourceImportPolicy } from "@/lib/video-sources";
import { PROVIDERS, type ExternalVideo } from "@/lib/external-video-providers";

describe("external video ingestion safeguards", () => {
  it("recognizes supported HTTPS source URLs and requires authorization", () => {
    expect(identifyVideoSource("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(identifyVideoSource("http://tiktok.com/@creator/video/1")).toBeNull();
    expect(sourceImportPolicy("instagram").toLowerCase()).toContain("official api");
  });

  it("does not discover or refresh without an authorized provider implementation", async () => {
    const video: ExternalVideo = {
      source_platform: "youtube",
      original_content_id: "abc",
      original_url: "https://youtube.com/watch?v=abc",
      creator_name: "Creator",
      creator_attribution: "Creator on YouTube",
      thumbnail_url: null,
      embed_url: "https://www.youtube.com/embed/abc",
      title: "Authorized embed",
      description: null,
      category: "Music",
      published_at: null,
      authorization_type: "official_embed",
      country_code: null,
      language_code: null,
      source_metadata: {},
    };
    expect(await PROVIDERS.youtube.discoverContent({})).toEqual([]);
    expect(await PROVIDERS.youtube.refreshMetadata(video, {})).toEqual({
      external_status: "unavailable",
    });
    expect(PROVIDERS.youtube.canEmbed(video)).toBe(true);
  });
});
