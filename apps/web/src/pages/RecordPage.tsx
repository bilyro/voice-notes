import styles from "./Page.module.css";

// Placeholder so the "New recording" links lead somewhere; the real screen is Task 1.11.
export function RecordPage() {
  return (
    <div className={`${styles.page} ${styles.form}`}>
      <h1>New recording</h1>
      <div className={styles.empty}>
        <p className="muted">Recording is coming in the next update.</p>
      </div>
    </div>
  );
}
