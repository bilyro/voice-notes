import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { Button } from "../components/Button";
import { PasswordField } from "../components/PasswordField";
import { useReturnTo } from "../lib/return-to";
import { AuthLayout } from "./AuthLayout";
import styles from "./Auth.module.css";

/** Better Auth error code → what to tell the user; anything else falls back to the server's message. */
function signInError(error: { code?: string; message?: string }) {
  if (error.code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password don’t match an account. Check them, or create an account.";
  return error.message ?? "Signing in failed. Check your connection, then try again.";
}

export function LoginPage() {
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // already signed in: go where you were headed (same target as after signing in, so the two never race)
  if (session) return <Navigate to={returnTo} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(signInError(error));
    // update the shared session store first, or RequireAuth sees the old (signed-out) session
    await refetchSession();
    navigate(returnTo, { replace: true });
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Your recordings and notes are where you left them." panel={<ExampleNotes />}>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>Email</label>
          <input id="email" className={styles.input} name="email" type="email" autoComplete="email" required />
        </div>
        <PasswordField autoComplete="current-password" />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" block disabled={pending} className={styles.submit}>{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className={styles.switch}>
        No account yet? <Link to="/signup" state={{ from: returnTo }}>Create one</Link>
      </p>
    </AuthLayout>
  );
}

/** Left side: last week's meeting as three pinned cards (decoration around a real sample). */
function ExampleNotes() {
  return (
    <>
      <p className={`pencil ${styles.pencilNote}`} aria-hidden="true">last week’s staff meeting:</p>
      <div className={styles.paperCard}>
        <span className={styles.tape} aria-hidden="true" />
        <p className={styles.cardLabel}>Summary</p>
        <p className={styles.cardText}>The fair moves to the gym; two classes share setup.</p>
      </div>
      <div className={styles.decisionCard}>
        <span className={styles.pin} aria-hidden="true" />
        <p className={styles.cardLabel}>Decision · <span className="tabular">4:12</span></p>
        <p className={styles.decisionText}>Science fair moves to the gym.</p>
      </div>
      <div className={styles.todoCard}>
        <p className={styles.cardLabel}>Action items</p>
        <p className={styles.cardText}>Book the gym, Dana by Monday</p>
        <p className={styles.cardText}>Send the newsletter, Sam by Friday</p>
      </div>
    </>
  );
}
