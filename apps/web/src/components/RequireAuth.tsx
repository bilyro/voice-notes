import { Navigate, Outlet } from "react-router";
import { authClient } from "../lib/auth-client";
import { AppShell } from "./AppShell";
import { LandingPage } from "../pages/LandingPage";

/** Renders child routes only for signed-in users. */
export function RequireAuth() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p>Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** `/`: the landing page for visitors, the app (recordings list) for signed-in users. Same URL, so links to "/" keep working. */
export function HomeRoute() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;   // a blank frame beats flashing the landing page at a signed-in user
  return session ? <AppShell /> : <LandingPage />;
}
