export const VIDEO_SOURCE_PROVIDERS = [
  "upload",
  "youtube",
  "facebook",
  "instagram",
  "tiktok",
  "other",
] as const;

export type VideoSourceProvider = (typeof VIDEO_SOURCE_PROVIDERS)[number];

const HOSTS: Record<Exclude<VideoSourceProvider, "upload" | "other">, string[]> = {
  youtube: ["youtube.com", "youtu.be"],
  facebook: ["facebook.com", "fb.watch"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
};

export function identifyVideoSource(value: string): VideoSourceProvider | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  for (const [provider, hosts] of Object.entries(HOSTS)) {
    if (hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      return provider as VideoSourceProvider;
    }
  }
  return null;
}

export function sourceRequiresAuthorization(provider: VideoSourceProvider) {
  return provider !== "upload";
}

export function sourceImportPolicy(provider: VideoSourceProvider) {
  if (provider === "upload") return "User-uploaded file stored by KC Earn";
  return "Official API, licensed feed, embed, or creator-authorized import only";
}
