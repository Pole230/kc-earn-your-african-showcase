/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFileRoute } from "@tanstack/react-router";
import {
  createPaystackProvider,
  PaystackApiError,
  verifyPaystackTransfersAvailable,
} from "@/lib/paystack.server";

function authorized(request: Request) {
  const configured = process.env.EARNINGS_BLOCK_PAYOUT_PROCESS_SECRET;
  return Boolean(
    configured && request.headers.get("x-payout-process-secret") === configured,
  );
}

// Mirrors /api/payouts/process (the working welcome-bonus processor) exactly:
// pick up PAYOUT_QUEUED ("pending") rows, claim them one at a time so a
// concurrent run can't double-process, initiate the Paystack transfer for the
// server-configured user_payout_amount (never a client-supplied amount), and
// record the outcome. Failures never touch the reserved wallet balance here —
// that recovery is a separate, explicit service-role action.
export const Route = createFileRoute("/api/payouts/process-earnings-block")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          await verifyPaystackTransfersAvailable();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: queued, error } = await (supabaseAdmin as any)
            .from("earnings_block_withdrawals")
            .select("reference,user_payout_amount,currency,bank_account_id")
            .eq("status", "pending")
            .order("queued_at", { ascending: true })
            .limit(10);
          if (error) throw new Error(error.message);

          const provider = createPaystackProvider();
          const results = [];
          for (const withdrawal of queued ?? []) {
            const { data: claimed, error: claimError } = await (supabaseAdmin as any).rpc(
              "claim_earnings_block_withdrawal",
              { p_reference: withdrawal.reference },
            );
            if (claimError || !claimed) continue;

            const { data: bankAccount, error: bankError } = await (supabaseAdmin as any)
              .from("bank_accounts")
              .select("external_id")
              .eq("id", withdrawal.bank_account_id)
              .single();
            if (bankError || !bankAccount?.external_id) {
              await (supabaseAdmin as any).rpc("fail_earnings_block_withdrawal", {
                p_reference: withdrawal.reference,
                p_reason: "Recipient bank account is missing or unresolved",
              });
              results.push({ reference: withdrawal.reference, status: "FAILED" });
              continue;
            }

            let transfer: { providerReference: string; status: "PROCESSING" };
            try {
              // Amount comes only from the trusted database row
              // (user_payout_amount = platform_reward_config.earnings_block_user_share,
              // i.e. exactly ₦20,000 per block) — never from client input.
              transfer = await provider.initiateTransfer({
                recipientReference: bankAccount.external_id,
                amount: Number(withdrawal.user_payout_amount),
                currency: withdrawal.currency,
                reference: withdrawal.reference,
              });
            } catch (transferError) {
              if (transferError instanceof PaystackApiError) {
                await (supabaseAdmin as any).rpc("fail_earnings_block_withdrawal", {
                  p_reference: withdrawal.reference,
                  p_reason: transferError.message,
                });
                results.push({ reference: withdrawal.reference, status: "FAILED" });
              } else {
                console.error(
                  "Paystack transfer outcome is unknown; leaving earnings block withdrawal PROCESSING",
                );
                results.push({ reference: withdrawal.reference, status: "PROCESSING" });
              }
              continue;
            }

            const { error: markError } = await (supabaseAdmin as any).rpc(
              "set_earnings_block_provider_reference",
              { p_reference: withdrawal.reference, p_provider_reference: transfer.providerReference },
            );
            if (markError) {
              console.error(
                "Paystack transfer accepted but provider reference was not recorded",
                markError,
              );
              results.push({ reference: withdrawal.reference, status: "PROCESSING" });
              continue;
            }
            results.push({ reference: withdrawal.reference, status: transfer.status });
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
