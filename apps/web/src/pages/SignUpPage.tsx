import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { Button } from "../components/Button";
import { PasswordField } from "../components/PasswordField";
import { useReturnTo } from "../lib/return-to";
import { PASSWORD_MAX, PASSWORD_MIN, passwordMessage } from "../lib/password-errors";
import { AuthLayout } from "./AuthLayout";
import styles from "./Auth.module.css";

const STEPS = [
  { title: "Record in the browser", text: "Meetings, lessons or quick voice memos. Nothing to install." },
  { title: "Get the transcript", text: "Every line has a timestamp that plays the audio from there." },
  { title: "Use the notes", text: "Summary, decisions and action items, ready to edit or copy." },
];

export function SignUpPage() {
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<ReactNode>(null);
  const [pending, setPending] = useState(false);

  if (session) return <Navigate to={returnTo} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      // Better Auth error codes, with the server's message as the fallback
      if (error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        return setError(<>An account with this email already exists. <Link to="/login" state={{ from: returnTo }}>Sign in instead</Link></>);
      }
      if (error.status === 429) return setError("Too many tries. Wait 10 seconds, then try again.");
      const about = passwordMessage(error);
      if (about) return setError(about);
      return setError(error.message ?? "Creating the account failed. Check your connection, then try again.");
    }
    // update the shared session store first, or RequireAuth sees the old (signed-out) session
    await refetchSession();
    navigate(returnTo, { replace: true });   // sign-up also signs you in
  }

  return (
    <AuthLayout title="Create account" subtitle="Free while we test it. Recording minutes have a monthly limit." panel={<Steps />}>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label htmlFor="name" className={styles.label}>Name</label>
          <input id="name" className={styles.input} name="name" autoComplete="name" required />
        </div>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>Email</label>
          <input id="email" className={styles.input} name="email" type="email" autoComplete="email" required />
        </div>
        <PasswordField autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" block disabled={pending} className={styles.submit}>{pending ? "Creating account…" : "Create account"}</Button>
      </form>
      <p className={styles.switch}>
        Already have an account? <Link to="/login" state={{ from: returnTo }}>Sign in</Link>
      </p>
    </AuthLayout>
  );
}

/** Left side: what you get, as cards on the board, plus the free-plan notice. */
function Steps() {
  const looks = [styles.decisionCard, styles.todoCard, styles.paperCard];
  return (
    <>
      <p className={`pencil ${styles.pencilNote}`} aria-hidden="true">what you get:</p>
      {STEPS.map((s, i) => (
        <div key={s.title} className={looks[i]}>
          {i === 0 && <span className={styles.pin} aria-hidden="true" />}
          {i === 2 && <span className={styles.tape} aria-hidden="true" />}
          <strong className={styles.stepTitle}>{s.title}</strong>
          <span className={styles.stepText}>{s.text}</span>
        </div>
      ))}
      <p className={styles.freeNote}>
        <strong>Free plan:</strong> recordings are processed by a free service with no privacy guarantee. Use it for test recordings.
      </p>
    </>
  );
}
