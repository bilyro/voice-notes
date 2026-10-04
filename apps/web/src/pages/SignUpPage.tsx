import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";

export function SignUpPage() {
  const navigate = useNavigate();
  const { refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(error.message ?? "Sign up failed");
    // update the shared session store first, or RequireAuth sees the old (signed-out) session
    await refetchSession();
    navigate("/", { replace: true });   // sign-up also signs you in
  }

  return (
    <main className="auth">
      <h1>Create account</h1>
      <form onSubmit={onSubmit}>
        <label>Name <input name="name" autoComplete="name" required /></label>
        <label>Email <input name="email" type="email" autoComplete="email" required /></label>
        <label>Password <input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={pending}>{pending ? "Creating…" : "Sign up"}</button>
      </form>
      <p>Have an account? <Link to="/login">Sign in</Link></p>
    </main>
  );
}
