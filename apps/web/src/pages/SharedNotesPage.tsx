import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { LANGUAGE_NAMES, type RecordingMode, type SharedRecording } from "@vn/shared";
import { ButtonLink } from "../components/Button";
import { LogoMark } from "../components/LogoMark";
import { NotesEditor } from "../components/NotesEditor";
import { api, ApiError } from "../lib/api";
import styles from "./SharedNotesPage.module.css";

const MODE_LABEL: Record<RecordingMode, string> = { meeting: "Meeting", lesson: "Lesson", memo: "Voice memo" };
const noop = () => {};

/** `/s/:token` (Task 1.30): anyone with the link reads the notes. No sign-in, no transcript, no audio, no editing. */
export function SharedNotesPage() {
  const { token } = useParams() as { token: string };
  const { data, error } = useQuery({ queryKey: ["shared", token], queryFn: () => api<SharedRecording>(`/shared/${token}`) });

  return (
    <div className={styles.page}>
      {/* React 19 puts these in <head>: shared notes stay out of search engines */}
      <meta name="robots" content="noindex" />
      <title>{data ? `${data.title} · Voice notes` : "Shared notes · Voice notes"}</title>

      <header className={styles.header}>
        <Link to="/about" className={styles.logo}>
          <LogoMark />
          Voice notes
        </Link>
      </header>

      <main className={styles.main}>
        {error ? (
          <div className={styles.dead}>
            {error instanceof ApiError && error.status === 404 ? (
              <>
                <h1 className={styles.deadTitle}>This link doesn't work any more.</h1>
                <p className={styles.soft}>Whoever shared it turned it off, or deleted the recording.</p>
              </>
            ) : (
              <>
                <h1 className={styles.deadTitle}>These notes could not be loaded.</h1>
                <p className={styles.soft}>Check your connection, then reload the page.</p>
              </>
            )}
            <ButtonLink to="/about" variant="secondary">What is Voice notes?</ButtonLink>
          </div>
        ) : data && (
          <>
            <p className={styles.kicker}>Shared notes · read-only</p>
            <h1 className={styles.title}>{data.title}</h1>
            <p className={styles.meta}>
              {[
                MODE_LABEL[data.mode],
                new Date(data.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
                data.durationMs !== null && `${Math.max(1, Math.round(data.durationMs / 60_000))} min`,
                data.language !== "en" && LANGUAGE_NAMES[data.language],
              ].filter(Boolean).join(" · ")}
            </p>
            <div className={styles.notes}>
              <NotesEditor notes={data.notes} mode={data.mode} lang={data.language} editing={false} saving={false} readOnly error={null}
                onSave={noop} onCancel={noop} onToggleDone={noop} />
            </div>
          </>
        )}
      </main>

      <footer className={styles.footer}>
        Made with <Link to="/about">Voice notes</Link>
      </footer>
    </div>
  );
}
