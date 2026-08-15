import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ScreenHeader } from "@/components/ScreenHeader";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const value = s.next;
    const safe =
      typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : undefined;
    return safe ? { next: safe } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in to KC Earn" },
      {
        name: "description",
        content: "Create a KC Earn creator account to upload videos and share your stories.",
      },
      { property: "og:title", content: "Sign in to KC Earn" },
      { property: "og:description", content: "Join KC Earn to upload and share African stories." },
    ],
  }),
  component: AuthScreen,
});

function AuthScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const { next } = Route.useSearch();
  const returnTo = next ? `${window.location.origin}${next}` : window.location.origin;

  function goAfterAuth() {
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/upload" });
  }
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: returnTo,
            data: { display_name: displayName.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;

        // If signUp returns a user but no session, they likely need email confirmation.
        if (!data?.session) {
          toast.success("Account created", {
            description: "Check your email to confirm your account before signing in.",
          });
          // stay on auth screen so user can confirm email and then sign in
          setBusy(false);
          return;
        }

        toast.success("Account created", { description: "You can start uploading now." });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        // If no session returned, provide a helpful message (email confirmation or other flow)
        if (!data?.session) {
          toast.error(
            "Sign-in incomplete: please confirm your email or check your credentials.",
          );
          setBusy(false);
          return;
        }

        toast.success("Welcome back");
      }
      await router.invalidate();
      goAfterAuth();
    } catch (err) {
      // Improve error messages for common Supabase auth failures
      const message =
        err && typeof err === "object" && "error" in (err as any) && (err as any).error
          ? (err as any).error
          : err instanceof Error
          ? err.message
          : String(err);
      toast.error(message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: returnTo,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    await router.invalidate();
    goAfterAuth();
  }

  const input =
    "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-brand";

  return (
    <div className="px-5 pb-4">
      <ScreenHeader
        title={mode === "signin" ? "Sign in" : "Create account"}
        subtitle="Your creator account for KC Earn uploads"
      />

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
              mode === m ? "bg-brand text-brand-foreground" : "text-muted-foreground"
            }`}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" ? (
          <input
            className={input}
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
          />
        ) : null}
        <input
          className={input}
          type="email"
          required
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={input}
          type="password"
          required
          minLength={6}
          placeholder="Password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="gradient-brand w-full rounded-2xl py-4 text-base font-bold text-brand-foreground shadow-lift disabled:opacity-40"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={google}
        className="w-full rounded-2xl border border-border bg-surface py-4 text-base font-semibold"
      >
        Continue with Google
      </button>
    </div>
  );
}
