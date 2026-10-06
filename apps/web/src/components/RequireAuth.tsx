import { Navigate, Outlet, useLocation } from "react-router";
import { authClient } from "../lib/auth-client";
import { AppShell } from "./AppShell";
import { LandingPage } from "../pages/LandingPage";

/** Renders child routes only for signed-in users. */
export function RequireAuth() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();
  if (isPending) return <p>Loading…</p>;
  // remember where the visitor was going, so signing in lands them there (lib/return-to.ts)
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** `/`: the landing page for visitors, the app (recordings list) for signed-in users. Same URL, so links to "/" keep working. */
export function HomeRoute() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;   // a blank frame beats flashing the landing page at a signed-in user
  return session ? <AppShell /> : <LandingPage />;
}
