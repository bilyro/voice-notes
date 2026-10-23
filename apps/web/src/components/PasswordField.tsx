import { useId, useState } from "react";
import styles from "../pages/Auth.module.css";

type Props = {
  autoComplete: "current-password" | "new-password";
  /** sign up: shows "At least N characters" and ticks it when met */
  minLength?: number;
  maxLength?: number;
};

/** Password input with a Show/Hide toggle; on sign up also the length hint. */
export function PasswordField({ autoComplete, minLength, maxLength }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [length, setLength] = useState(0);
  const met = minLength !== undefined && length >= minLength;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>Password</label>
      <div className={styles.passwordWrap}>
        <input
          id={id}
          className={`${styles.input} ${styles.passwordInput}`}
          name="password"
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required
          aria-describedby={minLength ? `${id}-hint` : undefined}
          onChange={(e) => setLength(e.target.value.length)}
        />
        <button type="button" className={styles.toggle} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {minLength !== undefined && (
        <span id={`${id}-hint`} className={`${styles.hint} ${met ? styles.hintMet : ""}`}>
          {met && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          )}
          At least {minLength} characters
        </span>
      )}
    </div>
  );
}
