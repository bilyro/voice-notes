import { createAuthClient } from "better-auth/react";

// Better Auth appends /api/auth itself and rejects relative URLs, so don't pass VITE_API_URL.
export const authClient = createAuthClient({
  // dev: API on another port; production: same origin (Caddy routes /api/* to the API)
  baseURL: import.meta.env.DEV ? "http://localhost:3000" : undefined,
});
