import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

/**
 * Client-side auth guard for protected routes.
 *
 * This app has no server-side session (Supabase auth state lives in
 * browser localStorage only — see src/integrations/supabase/client.ts),
 * so the guard runs on the client after the session has finished loading
 * rather than as a router `beforeLoad`. Checking auth during SSR would see
 * "no session" on every request (logged in or not) and bounce everyone,
 * including already-authenticated users on a normal page refresh.
 *
 * While `loading` is true we don't know the session yet, so callers should
 * keep rendering a neutral/loading state and must NOT assume the user is
 * signed out.
 *
 * Only requires a signed-in session — does not require the account to be
 * fully verified. Use this for /verification itself and any other route
 * that should be reachable by an authenticated-but-unverified user.
 */
export function useRequireAuth() {
  const { user, loading, session, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (loading || user) return;
    navigate({ to: "/auth", search: { next: pathname }, replace: true });
  }, [loading, user, pathname, navigate]);

  return { user, loading, session, signOut, isAuthed: Boolean(user) };
}
