import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";

export function RecordingsPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api<{ ok: boolean }>("/health"),
  });

  async function signOut() {
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <main>
      <header>
        <h1>Recordings</h1>
        <span>{session?.user.email}</span>
        <button onClick={signOut}>Sign out</button>
      </header>
      <p className="muted">No recordings yet.</p>
      <footer className="muted">
        API health:{" "}
        {health.isPending ? "checking…" : health.isError ? `error (${health.error.message})` : JSON.stringify(health.data)}
      </footer>
    </main>
  );
}
