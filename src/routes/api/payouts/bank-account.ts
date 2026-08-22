/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/ai-chat.server";
import { resolvePaystackRecipient } from "@/lib/paystack.server";

export const Route = createFileRoute("/api/payouts/bank-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        try {
          const body = (await request.json()) as { bankCode?: string; accountNumber?: string };
          const resolved = await resolvePaystackRecipient({
            bankCode: String(body.bankCode ?? ""),
            accountNumber: String(body.accountNumber ?? ""),
          });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await (supabaseAdmin as any)
            .from("bank_accounts")
            .insert({
              creator_id: auth.userId,
              provider: "paystack",
              external_id: resolved.recipientReference,
              account_holder: resolved.accountName,
              account_last4: resolved.accountLast4,
              account_mask: resolved.accountMask,
              metadata: { bank_code: resolved.bankCode },
              verified: true,
              verified_at: new Date().toISOString(),
              verification_reference: resolved.recipientReference,
            })
            .select("id,provider,account_holder,account_last4,account_mask,verified")
            .single();
          if (error) throw new Error(error.message);
          return Response.json(data, { status: 201 });
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : "Bank account validation failed",
            {
              status: 400,
            },
          );
        }
      },
    },
  },
});
