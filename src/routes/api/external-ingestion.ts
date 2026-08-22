import { createFileRoute } from "@tanstack/react-router";
import { runExternalIngestion } from "@/lib/external-ingestion.server";

export const Route = createFileRoute("/api/external-ingestion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const configuredSecret = process.env.EXTERNAL_INGESTION_JOB_SECRET;
        const suppliedSecret = request.headers.get("x-ingestion-secret");
        if (!configuredSecret)
          return Response.json({ error: "Job secret is not configured" }, { status: 503 });
        if (!suppliedSecret || suppliedSecret !== configuredSecret)
          return new Response("Forbidden", { status: 403 });
        try {
          return Response.json(await runExternalIngestion());
        } catch (error) {
          console.error(
            "[external-ingestion] job failed",
            error instanceof Error ? error.message : "unknown error",
          );
          return Response.json({ error: "Ingestion job failed" }, { status: 500 });
        }
      },
    },
  },
});
