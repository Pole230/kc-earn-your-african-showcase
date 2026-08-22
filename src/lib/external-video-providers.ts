import type { Category } from "@/data/content";
import type { Json } from "@/integrations/supabase/types";

export type ExternalPlatform =
  "youtube" | "tiktok" | "facebook" | "instagram" | "other_authorized_source";
export type AuthorizationType =
  | "official_api"
  | "official_embed"
  | "licensed_feed"
  | "creator_authorized_account"
  | "user_authorized_import";

export type ExternalVideo = {
  source_platform: ExternalPlatform;
  original_content_id: string;
  original_url: string;
  creator_name: string;
  creator_attribution: string;
  thumbnail_url: string | null;
  embed_url: string | null;
  title: string;
  description: string | null;
  category: Category;
  published_at: string | null;
  authorization_type: AuthorizationType;
  country_code: string | null;
  language_code: string | null;
  source_metadata: Json;
};

export type ProviderContext = {
  apiKey?: string;
  accessToken?: string;
  authorizedAccountId?: string;
};

export interface ExternalVideoProvider {
  readonly platform: ExternalPlatform;
  discoverContent(context: ProviderContext): Promise<ExternalVideo[]>;
  fetchAuthorizedMetadata(
    contentId: string,
    context: ProviderContext,
  ): Promise<ExternalVideo | null>;
  normalizeContent(raw: unknown): ExternalVideo | null;
  canEmbed(video: ExternalVideo): boolean;
  refreshMetadata(
    video: ExternalVideo,
    context: ProviderContext,
  ): Promise<Partial<ExternalVideo> & { external_status?: "active" | "unavailable" | "revoked" }>;
}

abstract class NoCredentialProvider implements ExternalVideoProvider {
  abstract readonly platform: ExternalPlatform;

  async discoverContent(_context: ProviderContext): Promise<ExternalVideo[]> {
    return [];
  }

  async fetchAuthorizedMetadata(
    _contentId: string,
    _context: ProviderContext,
  ): Promise<ExternalVideo | null> {
    return null;
  }

  normalizeContent(_raw: unknown): ExternalVideo | null {
    return null;
  }

  canEmbed(video: ExternalVideo): boolean {
    return Boolean(video.embed_url);
  }

  async refreshMetadata(_video: ExternalVideo, _context: ProviderContext) {
    return { external_status: "unavailable" as const };
  }
}

export class YouTubeProvider extends NoCredentialProvider {
  readonly platform = "youtube" as const;
}
export class TikTokProvider extends NoCredentialProvider {
  readonly platform = "tiktok" as const;
}
export class FacebookProvider extends NoCredentialProvider {
  readonly platform = "facebook" as const;
}
export class InstagramProvider extends NoCredentialProvider {
  readonly platform = "instagram" as const;
}

export const PROVIDERS: Record<ExternalPlatform, ExternalVideoProvider> = {
  youtube: new YouTubeProvider(),
  tiktok: new TikTokProvider(),
  facebook: new FacebookProvider(),
  instagram: new InstagramProvider(),
  other_authorized_source: new InstagramProvider(),
};

export function providerFor(platform: ExternalPlatform) {
  return PROVIDERS[platform];
}
