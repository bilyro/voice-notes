import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { Button } from "../components/Button";
import { AuthLayout } from "./AuthLayout";
import styles from "./Auth.module.css";

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
    <AuthLayout title="Sign in">
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          Email
          <input className={styles.input} name="email" type="email" autoComplete="email" required />
        </label>
        <label className={styles.field}>
          Password
          <input className={styles.input} name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" block disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className={styles.switch}>No account? <Link to="/signup">Create one</Link></p>
    </AuthLayout>
  );
}
