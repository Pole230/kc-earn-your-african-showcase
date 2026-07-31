import { createFileRoute } from "@tanstack/react-router";

/**
 * Returns a privacy-preserving view context: a salted hash of the caller IP and
 * the edge-detected country. The raw IP never leaves the server.
 */
export const Route = createFileRoute("/api/public/view-context")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = request.headers;
        const ip =
          headers.get("cf-connecting-ip") ??
          headers.get("x-real-ip") ??
          (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
          "";
        const country = headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country") ?? null;

        let ipHash: string | null = null;
        if (ip) {
          const salt = process.env.SUPABASE_PROJECT_ID ?? "kc-earn";
          const bytes = new TextEncoder().encode(`${salt}:${ip}`);
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          ipHash = Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        }

        return Response.json(
          { ipHash, country: country && country !== "XX" ? country : null },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
