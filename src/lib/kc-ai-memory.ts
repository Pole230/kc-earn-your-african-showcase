import type { Database } from "@/integrations/supabase/types";

type AuthContext = { supabase: import("@supabase/supabase-js").SupabaseClient<Database>; userId: string };

export async function getUserAiPreferences(auth: AuthContext): Promise<Record<string, any>> {
  try {
    const { data, error } = await (auth.supabase as any)
      .from("ai_user_preferences")
      .select("key, value")
      .eq("user_id", auth.userId);

    if (error) {
      console.error("[kc-earn-ai] failed to load user preferences", error);
      return {};
    }

    const map: Record<string, any> = {};
    (data ?? []).forEach((row: any) => {
      try {
        map[row.key] = row.value;
      } catch (e) {
        map[row.key] = row.value;
      }
    });
    return map;
  } catch (err) {
    console.error("[kc-earn-ai] unexpected error loading preferences", err);
    return {};
  }
}

export async function setUserAiPreference(auth: AuthContext, key: string, value: any) {
  try {
    const payload = {
      user_id: auth.userId,
      key,
      value,
      updated_at: new Date().toISOString(),
    } as any;

    const { error } = await (auth.supabase as any)
      .from("ai_user_preferences")
      .upsert([payload], { onConflict: "user_id,key" });

    if (error) {
      console.error("[kc-earn-ai] failed to set user preference", error);
      return { error };
    }
    return { ok: true };
  } catch (err) {
    console.error("[kc-earn-ai] exception setting preference", err);
    return { error: err };
  }
}

export async function updateUserAiPreferences(auth: AuthContext, prefs: Record<string, any>) {
  try {
    const rows = Object.keys(prefs).map((k) => ({
      user_id: auth.userId,
      key: k,
      value: prefs[k],
      updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return { ok: true };
    const { error } = await (auth.supabase as any).from("ai_user_preferences").upsert(rows, { onConflict: "user_id,key" });
    if (error) {
      console.error("[kc-earn-ai] failed to update preferences", error);
      return { error };
    }
    return { ok: true };
  } catch (err) {
    console.error("[kc-earn-ai] exception updating preferences", err);
    return { error: err };
  }
}
