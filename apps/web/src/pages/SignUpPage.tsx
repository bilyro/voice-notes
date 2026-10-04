import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { Button } from "../components/Button";
import { AuthLayout } from "./AuthLayout";
import styles from "./Auth.module.css";

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
    <AuthLayout title="Create account">
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          Name
          <input className={styles.input} name="name" autoComplete="name" required />
        </label>
        <label className={styles.field}>
          Email
          <input className={styles.input} name="email" type="email" autoComplete="email" required />
        </label>
        <label className={styles.field}>
          Password
          <input className={styles.input} name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" block disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
      </form>
      <p className={styles.switch}>Have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  );
}
