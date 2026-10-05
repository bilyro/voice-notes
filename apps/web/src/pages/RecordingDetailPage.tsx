import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Recording } from "@vn/shared";
import { api } from "../lib/api";
import styles from "./Page.module.css";

const STEP: Record<Recording["status"], string> = {
  recording: "Recording",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  summarizing: "Writing notes",
  ready: "Ready",
  failed: "Failed",
};

// Placeholder so Stop and save leads somewhere: title + live status. The real page is Task 1.13.
export function RecordingDetailPage() {
  const { id } = useParams();
  const { data, error } = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api<{ recording: Recording }>(`/recordings/${id}`),
    refetchInterval: (q) => (["ready", "failed"].includes(q.state.data?.recording.status ?? "") ? false : 2000),
  });

  if (error) return <div className={`${styles.page} ${styles.form}`}><p className="muted">{error.message}</p></div>;
  if (!data) return null;
  const rec = data.recording;
  return (
    <div className={`${styles.page} ${styles.form}`}>
      <h1>{rec.title}</h1>
      <div className={styles.empty}>
        <p role="status">
          {STEP[rec.status]}
          {rec.status === "failed" && rec.error ? `: ${rec.error}` : ""}
        </p>
        <p className="muted">Notes, transcript and the player are coming in the next update.</p>
      </div>
    </div>
  );
}
