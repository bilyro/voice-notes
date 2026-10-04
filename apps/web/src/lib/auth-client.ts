import { createAuthClient } from "better-auth/react";

// Better Auth runs inside the API server under /api/auth/*
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
});
