import type { Recording } from "@vn/shared";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";
import styles from "./StatusLabel.module.css";

/** Where each processing step sits on the progress bar. */
const STEPS: Partial<Record<Recording["status"], { label: string; progress: number }>> = {
  uploaded: { label: "Waiting to start", progress: 0.1 },
  transcribing: { label: "Transcribing", progress: 0.35 },
  summarizing: { label: "Writing notes", progress: 0.7 },
};

/** Stored errors are for us; people see what happened in plain words. */
function failureText(error: string | null) {
  if (error === "No speech detected") return "No speech found in the audio";
  return "Processing failed";
}

type Props = { recording: Pick<Recording, "status" | "error">; onRetry?: () => void; retrying?: boolean };

export function StatusLabel({ recording, onRetry, retrying }: Props) {
  const { status, error } = recording;

  if (status === "ready") {
    return (
      <span className={styles.ready}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5 9-10" />
        </svg>
        Notes ready
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className={styles.failed}>
        {failureText(error)}
        {onRetry && (
          <Button variant="secondary" size="small" onClick={onRetry} disabled={retrying}>
            Try again
          </Button>
        )}
      </span>
    );
  }

  if (status === "recording") return <span className={styles.muted}>Not finished</span>;

  const step = STEPS[status]!;
  return (
    <span className={styles.muted}>
      {step.label}
      <ProgressBar value={step.progress} />
    </span>
  );
}
