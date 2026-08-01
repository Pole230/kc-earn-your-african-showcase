import { describe, it, expect, vi } from "vitest";
import { getUserAiPreferences, setUserAiPreference, updateUserAiPreferences } from "@/lib/kc-ai-memory";

function makeMockSupabase(data: any[] = []) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    // simulate select returning data
    then: undefined,
    // We'll stub the call to .select(...).eq(...)
    rpc: vi.fn(),
    // direct way to mock select response via a helper
    __selectResponse: data,
  };
}

describe("kc-ai-memory", () => {
  it("getUserAiPreferences returns mapped prefs", async () => {
    const mockSupabase: any = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [{ key: "preferred_language", value: "English" }] }) }) }),
    };
    const auth = { supabase: mockSupabase, userId: "user-1" } as any;
    const prefs = await getUserAiPreferences(auth);
    expect(prefs.preferred_language).toBe("English");
  });

  it("setUserAiPreference upserts without error", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase: any = { from: () => ({ upsert: upsertMock }) };
    const auth = { supabase: mockSupabase, userId: "user-1" } as any;
    const res = await setUserAiPreference(auth, "preferred_language", "English");
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalled();
  });

  it("updateUserAiPreferences upserts multiple rows", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase: any = { from: () => ({ upsert: upsertMock }) };
    const auth = { supabase: mockSupabase, userId: "user-1" } as any;
    const res = await updateUserAiPreferences(auth, { preferred_language: "English", audience: "Nigeria" });
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalled();
  });
});
