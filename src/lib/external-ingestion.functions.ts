import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(userId: string, userClient: SupabaseClient<Database>) {
  const { data } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const loadExternalIngestionConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("external_ingestion_config")
      .select("*")
      .eq("id", true)
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateExternalIngestionConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      automatic_ingestion_enabled?: boolean;
      user_upload_priority?: number;
      max_external_feed_ratio?: number;
      external_content_limit?: number;
      ingestion_frequency_minutes?: number;
      approved_categories?: string[];
      supported_countries?: string[];
      enabled_providers?: string[];
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("external_ingestion_config")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
