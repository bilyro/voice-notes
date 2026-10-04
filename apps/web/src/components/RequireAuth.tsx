import { Navigate, Outlet } from "react-router";
import { authClient } from "../lib/auth-client";

/** Renders child routes only for signed-in users. */
export function RequireAuth() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p>Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
