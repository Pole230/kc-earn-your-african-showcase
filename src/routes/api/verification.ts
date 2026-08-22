import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/ai-chat.server";
import {
  generateVerificationCode,
  hashVerificationCode,
  normalizePhoneNumber,
  sendVerificationEmail,
  sendVerificationSms,
} from "@/lib/verification";

type VerificationBody = { action?: string; phone?: string; code?: string };
type VerificationRpc = (
  name: string,
  args: Record<string, string>,
) => Promise<{ error: { message: string } | null }>;
type VerificationStatus = {
  phone_verified_at: string | null;
  email_verified_at: string | null;
};
function verificationState(status: VerificationStatus | null) {
  const phone = Boolean(status?.phone_verified_at);
  const email = Boolean(status?.email_verified_at);
  if (phone && email) return "FULLY_VERIFIED";
  if (phone) return "EMAIL_UNVERIFIED";
  if (email) return "PHONE_UNVERIFIED";
  return "PARTIALLY_VERIFIED";
}
type VerificationQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: VerificationStatus | null; error: Error | null }>;
      };
    };
  };
};

export const Route = createFileRoute("/api/verification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json()) as VerificationBody;
        const channel = body.action?.startsWith("phone")
          ? "phone"
          : body.action?.startsWith("email")
            ? "email"
            : null;
        if (!channel) return new Response("Invalid verification action", { status: 400 });
        try {
          const rpc = (auth.supabase.rpc as unknown as VerificationRpc).bind(auth.supabase);
          if (body.action === `${channel}:send`) {
            const target =
              channel === "phone"
                ? normalizePhoneNumber(String(body.phone ?? ""))
                : (await auth.supabase.auth.getUser()).data.user?.email;
            if (!target) throw new Error("A valid email address is required");
            const code = generateVerificationCode();
            const { error } = await rpc("start_verification_challenge", {
              p_channel: channel,
              p_target: target,
              p_code_hash: hashVerificationCode(code),
              p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            });
            if (error) throw error;
            if (channel === "phone") await sendVerificationSms(target, code);
            else await sendVerificationEmail(target, code);
            return Response.json({ ok: true });
          }
          if (body.action === `${channel}:verify`) {
            if (!/^\d{6}$/.test(body.code ?? "")) {
              return new Response("Enter the six-digit code", { status: 400 });
            }
            const { error } = await rpc("complete_verification", {
              p_channel: channel,
              p_code_hash: hashVerificationCode(body.code!),
            });
            if (error) throw error;
            return Response.json({ ok: true });
          }
          return new Response("Invalid verification action", { status: 400 });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Verification failed", {
            status: 400,
          });
        }
      },
      GET: async ({ request }) => {
        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const client = auth.supabase as unknown as VerificationQueryClient;
        const { data, error } = await client
          .from("account_verifications")
          .select("phone_verified_at,email_verified_at")
          .eq("user_id", auth.userId)
          .maybeSingle();
        if (error) return new Response("Could not load verification status", { status: 500 });
        return Response.json({
          phone_verified_at: data?.phone_verified_at ?? null,
          email_verified_at: data?.email_verified_at ?? null,
          state: verificationState(data),
        });
      },
    },
  },
});
