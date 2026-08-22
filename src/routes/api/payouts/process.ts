/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFileRoute } from "@tanstack/react-router";
import {
  createPaystackProvider,
  PaystackApiError,
  verifyPaystackTransfersAvailable,
} from "@/lib/paystack.server";

function authorized(request: Request) {
  const configured = process.env.WELCOME_PAYOUT_PROCESS_SECRET;
  return Boolean(configured && request.headers.get("x-payout-process-secret") === configured);
}

export const Route = createFileRoute("/api/payouts/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          await verifyPaystackTransfersAvailable();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: queued, error } = await (supabaseAdmin as any)
            .from("welcome_bonus_payouts")
            .select("reference,recipient_reference,amount,currency")
            .eq("status", "PAYOUT_QUEUED")
            .order("queued_at", { ascending: true })
            .limit(10);
          if (error) throw new Error(error.message);
          const provider = createPaystackProvider();
          const results = [];
          for (const payout of queued ?? []) {
            const { data: claimed, error: claimError } = await (supabaseAdmin as any).rpc(
              "claim_welcome_bonus_payout",
              { p_reference: payout.reference },
            );
            if (claimError || !claimed) continue;
            let transfer: { providerReference: string; status: "PROCESSING" };
            try {
              transfer = await provider.initiateTransfer({
                recipientReference: payout.recipient_reference,
                amount: Number(payout.amount),
                currency: payout.currency,
                reference: payout.reference,
              });
            } catch (error) {
              if (error instanceof PaystackApiError) {
                await (supabaseAdmin as any).rpc("fail_welcome_bonus_payout", {
                  p_reference: payout.reference,
                  p_reason: error.message,
                });
                results.push({ reference: payout.reference, status: "FAILED" });
              } else {
                console.error("Paystack transfer outcome is unknown; leaving payout PROCESSING");
                results.push({ reference: payout.reference, status: "PROCESSING" });
              }
              continue;
            }
            const { error: markError } = await (supabaseAdmin as any).rpc(
              "set_welcome_bonus_provider_reference",
              { p_reference: payout.reference, p_provider_reference: transfer.providerReference },
            );
            if (markError) {
              console.error(
                "Paystack transfer accepted but provider reference was not recorded",
                markError,
              );
              results.push({ reference: payout.reference, status: "PROCESSING" });
              continue;
            }
            results.push({ reference: payout.reference, status: transfer.status });
          }
          return Response.json({ ok: true, processed: results });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Payout processing unavailable";
          return new Response(`Paystack Transfers unavailable: ${message}`, { status: 503 });
        }
      },
    },
  },
});
