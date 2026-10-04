import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const { refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(error.message ?? "Sign in failed");
    // update the shared session store first, or RequireAuth sees the old (signed-out) session
    await refetchSession();
    navigate("/", { replace: true });
  }

  return (
    <main className="auth">
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label>Email <input name="email" type="email" autoComplete="email" required /></label>
        <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p>No account? <Link to="/signup">Sign up</Link></p>
    </main>
  );
}
