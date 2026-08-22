import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  providerFor,
  PROVIDERS,
  type ExternalPlatform,
  type ProviderContext,
} from "@/lib/external-video-providers";

const platforms = Object.keys(PROVIDERS) as ExternalPlatform[];

function contextFor(platform: ExternalPlatform): ProviderContext {
  const prefix = platform.toUpperCase();
  return {
    apiKey: process.env[`${prefix}_API_KEY`],
    accessToken: process.env[`${prefix}_ACCESS_TOKEN`],
    authorizedAccountId: process.env[`${prefix}_AUTHORIZED_ACCOUNT_ID`],
  };
}

export async function runExternalIngestion() {
  const { data: config, error: configError } = await supabaseAdmin
    .from("external_ingestion_config")
    .select(
      "automatic_ingestion_enabled,enabled_providers,approved_categories,supported_countries,external_content_limit",
    )
    .eq("id", true)
    .single();
  if (configError) throw configError;
  if (!config?.automatic_ingestion_enabled)
    return { skipped: true, reason: "automatic ingestion disabled" };

  const enabled = (config.enabled_providers ?? []).filter((name): name is ExternalPlatform =>
    platforms.includes(name as ExternalPlatform),
  );
  const summary = {
    skipped: false,
    discovered: 0,
    imported: 0,
    unavailable: 0,
    providers: [] as string[],
  };

  for (const platform of enabled) {
    const provider = providerFor(platform);
    const run = await supabaseAdmin
      .from("external_ingestion_runs")
      .insert({ provider: platform })
      .select("id")
      .single();
    const runId = run.data?.id;
    if (run.error || !runId) throw run.error ?? new Error("Could not create ingestion run");
    try {
      const discovered = await provider.discoverContent(contextFor(platform));
      const allowed = discovered
        .filter((video) => (config.approved_categories ?? []).includes(video.category))
        .filter(
          (video) =>
            !config.supported_countries?.length ||
            !video.country_code ||
            config.supported_countries.includes(video.country_code),
        )
        .filter((video) => provider.canEmbed(video))
        .slice(0, config.external_content_limit ?? 20);
      let imported = 0;
      for (const video of allowed) {
        const { error } = await supabaseAdmin
          .from("external_videos")
          .upsert(
            { ...video, external_status: "active", last_synced_at: new Date().toISOString() },
            { onConflict: "source_platform,original_content_id" },
          );
        if (!error) imported += 1;
      }
      await supabaseAdmin
        .from("external_ingestion_runs")
        .update({
          finished_at: new Date().toISOString(),
          discovered_count: discovered.length,
          imported_count: imported,
        })
        .eq("id", runId);
      summary.discovered += discovered.length;
      summary.imported += imported;
      summary.providers.push(platform);
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider run failed";
      await supabaseAdmin
        .from("external_ingestion_runs")
        .update({ finished_at: new Date().toISOString(), error_message: message })
        .eq("id", runId);
      console.error(`[external-ingestion] ${platform} provider failed`, message);
    }
  }
  return summary;
}

export async function refreshExternalVideo(id: string) {
  const { data: video, error } = await supabaseAdmin
    .from("external_videos")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const provider = providerFor(video.source_platform as ExternalPlatform);
  const update = await provider.refreshMetadata(
    video as never,
    contextFor(video.source_platform as ExternalPlatform),
  );
  return supabaseAdmin
    .from("external_videos")
    .update({
      external_status: update.external_status,
      last_synced_at: new Date().toISOString(),
      ...(update.title === undefined ? {} : { title: update.title }),
      ...(update.description === undefined ? {} : { description: update.description }),
      ...(update.thumbnail_url === undefined ? {} : { thumbnail_url: update.thumbnail_url }),
      ...(update.embed_url === undefined ? {} : { embed_url: update.embed_url }),
    })
    .eq("id", id);
}
