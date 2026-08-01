import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { KcAiWelcome } from "@/components/ai/KcAiWelcome";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "Welcome — KC AI" }] }),
  component: WelcomeScreen,
});

function WelcomeScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    // No-op; the welcome component handles speech and calls onFinish when done.
  }, []);

  return (
    <KcAiWelcome
      onFinish={() => {
        try {
          // Mark that welcome was played in this session in case the user isn't signed in yet
          sessionStorage.setItem("kc_ai_welcome_played", "1");

          // If user is available, mark permanently that this user has seen the welcome
          if (user?.id) {
            const key = `kc_ai_welcome_shown_${user.id}`;
            try {
              localStorage.setItem(key, "1");
            } catch {}
          }
        } catch {}

        // After welcome finishes, go to dashboard
        navigate({ to: "/dashboard" });
      }}
    />
  );
}
