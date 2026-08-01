import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/ai-chat.server";
import { getUserAiPreferences, updateUserAiPreferences } from "@/lib/kc-ai-memory";

export const Route = createFileRoute("/api/ai/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateRequest(request);
          if (!auth) return new Response("Unauthorized", { status: 401 });

          const prefs = await getUserAiPreferences(auth as any);
          return new Response(JSON.stringify(prefs), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[kc-earn-ai] preferences GET error", err);
          return new Response("Internal Server Error", { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const auth = await authenticateRequest(request);
          if (!auth) return new Response("Unauthorized", { status: 401 });

          const body = (await request.json()) as Record<string, unknown>;

          // Validate keys
          const allowed = new Set([
            "preferred_language",
            "content_category",
            "audience",
            "creator_style",
            "caption_tone",
          ]);
          const prefs: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(body ?? {})) {
            if (!allowed.has(k)) continue;
            prefs[k] = v;
          }

          if (Object.keys(prefs).length === 0) {
            return new Response(JSON.stringify({ error: "No valid preferences provided" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const res = await updateUserAiPreferences(auth as any, prefs);
          if ((res as any).error) {
            return new Response(JSON.stringify({ error: (res as any).error.message ?? "DB error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[kc-earn-ai] preferences POST error", err);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
