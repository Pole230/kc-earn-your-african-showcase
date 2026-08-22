import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Status = {
  phone_verified_at: string | null;
  email_verified_at: string | null;
  state?: string;
};

export const Route = createFileRoute("/verification")({ component: VerificationScreen });

function VerificationScreen() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status>({
    phone_verified_at: null,
    email_verified_at: null,
  });
  const [phone, setPhone] = useState("");
  const [codes, setCodes] = useState({ phone: "", email: "" });
  const [sent, setSent] = useState({ phone: false, email: false });
  const [busy, setBusy] = useState<string | null>(null);

  async function callApi(action: string, body: Record<string, string> = {}) {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/verification", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/verification", {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    });
    if (response.ok) setStatus(await response.json());
  }

  useEffect(() => {
    if (user) void refresh();
  }, [user]);

  async function send(channel: "phone" | "email") {
    setBusy(`${channel}:send`);
    try {
      await callApi(`${channel}:send`, channel === "phone" ? { phone } : {});
      setSent((current) => ({ ...current, [channel]: true }));
      toast.success(`Verification code sent by ${channel === "phone" ? "SMS" : "email"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send code");
    } finally {
      setBusy(null);
    }
  }

  async function verify(channel: "phone" | "email") {
    setBusy(`${channel}:verify`);
    try {
      await callApi(`${channel}:verify`, { code: codes[channel] });
      await refresh();
      setCodes((current) => ({ ...current, [channel]: "" }));
      toast.success(`${channel === "phone" ? "Phone" : "Email"} verified`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify code");
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <div className="px-5">
        <ScreenHeader title="Verify account" subtitle="Loading…" />
      </div>
    );
  if (!user)
    return (
      <div className="px-5">
        <ScreenHeader title="Verify account" subtitle="Sign in to verify your account." />
        <Link
          to="/auth"
          className="gradient-brand block rounded-2xl py-3 text-center text-sm font-bold text-brand-foreground"
        >
          Sign in
        </Link>
      </div>
    );

  const item = (channel: "phone" | "email", label: string, Icon: typeof Phone) => {
    const verified = channel === "phone" ? status.phone_verified_at : status.email_verified_at;
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <Icon className="size-5 text-brand" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{label}</h2>
            <p className="text-xs text-muted-foreground">
              {verified ? "Verified" : `Verify your ${label.toLowerCase()}`}
            </p>
          </div>
          {verified ? <Check className="size-5 text-leaf" /> : null}
        </div>
        {!verified ? (
          <>
            {channel === "phone" ? (
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+254712345678"
                className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            ) : null}
            {sent[channel] ? (
              <input
                inputMode="numeric"
                maxLength={6}
                value={codes[channel]}
                onChange={(event) =>
                  setCodes((current) => ({ ...current, [channel]: event.target.value }))
                }
                placeholder="6-digit code"
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void send(channel)}
                disabled={busy !== null}
                className="gradient-brand flex-1 rounded-xl py-2.5 text-sm font-bold text-brand-foreground"
              >
                {busy === `${channel}:send`
                  ? "Sending…"
                  : sent[channel]
                    ? "Resend code"
                    : "Send code"}
              </button>
              {sent[channel] ? (
                <button
                  type="button"
                  onClick={() => void verify(channel)}
                  disabled={busy !== null}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold"
                >
                  Verify
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    );
  };

  const fullyVerified = Boolean(status.phone_verified_at && status.email_verified_at);
  return (
    <div className="px-5 pb-4">
      <ScreenHeader
        title="Verify your account"
        subtitle={
          fullyVerified
            ? "Your account is fully verified."
            : `Account status: ${status.state ?? "PARTIALLY_VERIFIED"}`
        }
      />
      <div className="space-y-3">
        {item("phone", "Phone number", Phone)}
        {item("email", "Email address", Mail)}
      </div>
    </div>
  );
}
