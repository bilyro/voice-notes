import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { PasswordField } from "../components/PasswordField";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN, passwordMessage } from "../lib/password-errors";
import auth from "./Auth.module.css";
import page from "./Page.module.css";
import styles from "./AccountPage.module.css";

type AuthError = { code?: string; status?: number; message?: string };

/** `/account` (Task 1.36): your name, your password, a copy of your data, deleting the account. */
export function AccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const user = session?.user;

  // name
  const [draft, setDraft] = useState<string | null>(null);   // null: show the saved name
  const name = draft ?? user?.name ?? "";
  const [nameState, setNameState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameState("saving");
    const { error } = await authClient.updateUser({ name: name.trim() });
    if (error) return setNameState("failed");
    await refetchSession();                                   // the sidebar's initials follow
    setDraft(null);
    setNameState("saved");
  }

  // password
  const [pw, setPw] = useState<{ state: "idle" | "saving" | "done"; error: string | null }>({ state: "idle", error: null });
  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const currentPassword = String(f.get("currentPassword")), newPassword = String(f.get("newPassword"));
    if (newPassword !== String(f.get("repeatPassword"))) return setPw({ state: "idle", error: "The two new passwords don't match." });
    setPw({ state: "saving", error: null });
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (error) {
      const err = error as AuthError;
      return setPw({ state: "idle", error:
        err.code === "INVALID_PASSWORD" ? "The current password isn't right."
        : err.status === 429 ? "Too many tries. Wait 10 seconds, then try again."
        : passwordMessage(err) ?? "The password could not be changed. Check your connection, then try again." });
    }
    form.reset();
    setPw({ state: "done", error: null });
  }

  // export
  const [exporting, setExporting] = useState<"idle" | "busy" | "failed">("idle");
  async function downloadData() {
    setExporting("busy");
    try {
      const data = await api<{ exportedAt: string }>("/account/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `voice-notes-export-${data.exportedAt.slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(url);
      setExporting("idle");
    } catch {
      setExporting("failed");
    }
  }

  // delete
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState<"idle" | "busy" | "failed">("idle");
  const deleteButton = useRef<HTMLButtonElement>(null);
  const confirmPanel = useRef<HTMLElement>(null);
  useEffect(() => { if (confirming) confirmPanel.current?.focus(); }, [confirming]);
  const matches = !!user && typed.trim().toLowerCase() === user.email.toLowerCase();
  function closeConfirm() {
    setConfirming(false);
    setTyped("");
    setDeleting("idle");
    deleteButton.current?.focus();
  }
  async function deleteAccount() {
    setDeleting("busy");
    try {
      await api("/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: typed }) });
    } catch {
      return setDeleting("failed");
    }
    queryClient.clear();
    await refetchSession();                                   // the session is gone: "/" shows the landing page
    navigate("/", { replace: true });
  }

  return (
    <div className={`${page.page} ${page.form}`}>
      <h1>Your account</h1>

      <section aria-labelledby="acc-profile" className={styles.card}>
        <h2 id="acc-profile" className={styles.heading}>Profile</h2>
        <p className={styles.text}>Signed in as <strong>{user?.email}</strong></p>
        <form onSubmit={saveName} className={styles.form}>
          <div className={auth.field}>
            <label htmlFor="acc-name" className={auth.label}>Name</label>
            <input id="acc-name" className={auth.input} name="name" autoComplete="name" required maxLength={100} value={name}
              onChange={(e) => { setDraft(e.target.value); setNameState("idle"); }} />
          </div>
          <div className={styles.row}>
            <Button type="submit" variant="secondary" disabled={nameState === "saving" || !name.trim() || name.trim() === user?.name}>
              {nameState === "saving" ? "Saving…" : "Save name"}
            </Button>
            <span role="status" className={styles.status}>{nameState === "saved" ? "Saved." : ""}</span>
          </div>
          {nameState === "failed" && <p className={auth.error} role="alert">The name could not be saved. Check your connection, then try again.</p>}
        </form>
      </section>

      <section aria-labelledby="acc-password" className={styles.card}>
        <h2 id="acc-password" className={styles.heading}>Password</h2>
        <form onSubmit={changePassword} className={styles.form}>
          <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
          <PasswordField name="newPassword" label="New password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} />
          <PasswordField name="repeatPassword" label="Repeat the new password" autoComplete="new-password" maxLength={PASSWORD_MAX} />
          <p className={styles.text}>Changing it signs you out on your other devices.</p>
          <div className={styles.row}>
            <Button type="submit" variant="secondary" disabled={pw.state === "saving"}>{pw.state === "saving" ? "Changing…" : "Change password"}</Button>
            <span role="status" className={styles.status}>{pw.state === "done" ? "Password changed." : ""}</span>
          </div>
          {pw.error && <p className={auth.error} role="alert">{pw.error}</p>}
        </form>
      </section>

      <section aria-labelledby="acc-data" className={styles.card}>
        <h2 id="acc-data" className={styles.heading}>Your data</h2>
        <p className={styles.text}>A copy of your recordings, transcripts and notes as one file (JSON). Audio isn't included: download it from each recording.</p>
        <div className={styles.row}>
          <Button variant="secondary" onClick={downloadData} disabled={exporting === "busy"}>{exporting === "busy" ? "Preparing…" : "Download my data"}</Button>
        </div>
        {exporting === "failed" && <p className={auth.error} role="alert">The file could not be made. Check your connection, then try again.</p>}
      </section>

      <section aria-labelledby="acc-delete" className={styles.card}>
        <h2 id="acc-delete" className={styles.heading}>Delete account</h2>
        <p className={styles.text}>Deletes every recording with its audio, transcript and notes, then the account. This can't be undone.</p>
        <div className={styles.row}>
          <Button ref={deleteButton} variant="secondary" aria-expanded={confirming} aria-controls="confirm-delete-account" onClick={() => (confirming ? closeConfirm() : setConfirming(true))}>
            Delete account
          </Button>
        </div>
        {confirming && (
          <section id="confirm-delete-account" ref={confirmPanel} tabIndex={-1} aria-labelledby="confirm-delete-account-title" className={styles.confirm}
            onKeyDown={(e) => { if (e.key === "Escape" && deleting !== "busy") closeConfirm(); }}>
            <h3 id="confirm-delete-account-title" className={styles.confirmTitle}>Delete your account for good?</h3>
            <div className={auth.field}>
              <label htmlFor="acc-confirm" className={auth.label}>Type your email to confirm</label>
              <input id="acc-confirm" className={auth.input} type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
            {deleting === "failed" && <p className={auth.error} role="alert">The account could not be deleted. Check your connection, then try again.</p>}
            <div className={styles.row}>
              {/* black, not red: red is reserved for recording and error text (DESIGN.md §1) */}
              <Button onClick={deleteAccount} disabled={!matches || deleting === "busy"}>{deleting === "busy" ? "Deleting…" : "Delete my account"}</Button>
              <Button variant="secondary" onClick={closeConfirm} disabled={deleting === "busy"}>Keep it</Button>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
