import { ButtonLink } from "../components/Button";
import styles from "./Page.module.css";

export function RecordingsPage() {
  return (
    <div className={`${styles.page} ${styles.list}`}>
      <h1>Recordings</h1>
      {/* the list itself arrives in Task 1.12 */}
      <div className={styles.empty}>
        <p className="muted">No recordings yet</p>
        <ButtonLink to="/record">New recording</ButtonLink>
      </div>
    </div>
  );
}
