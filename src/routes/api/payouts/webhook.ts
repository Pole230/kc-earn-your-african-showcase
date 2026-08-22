/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFileRoute } from "@tanstack/react-router";
import { verifyPaystackWebhookSignature } from "@/lib/paystack.server";

export const Route = createFileRoute("/api/payouts/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        try {
          if (
            !verifyPaystackWebhookSignature(rawBody, request.headers.get("x-paystack-signature"))
          ) {
            return new Response("Invalid signature", { status: 401 });
          }
          const event = JSON.parse(rawBody) as {
            event?: string;
            data?: { reference?: string; transfer_code?: string };
          };
          const reference = event.data?.reference;
          if (!reference) return new Response("Accepted", { status: 200 });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (event.event === "transfer.success") {
            const { error } = await (supabaseAdmin as any).rpc("confirm_welcome_bonus_paid", {
              p_reference: reference,
              p_provider_reference: event.data?.transfer_code ?? reference,
            });
            if (error) throw new Error(error.message);
          } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
            const { error } = await (supabaseAdmin as any).rpc("fail_welcome_bonus_payout", {
              p_reference: reference,
              p_reason: `Paystack transfer ${event.event.replace("transfer.", "")}`,
            });
            if (error) throw new Error(error.message);
          }
          return new Response("Accepted", { status: 200 });
        } catch (error) {
          console.error("Paystack webhook processing failed", error);
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
