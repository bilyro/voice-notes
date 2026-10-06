import { useLocation } from "react-router";

/** The page to return to after signing in: RequireAuth puts it in location state. Only same-site paths count. */
export function useReturnTo() {
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  // "//evil.example" would be a protocol-relative URL to another site
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}
