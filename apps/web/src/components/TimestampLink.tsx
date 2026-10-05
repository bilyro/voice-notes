import { formatDuration } from "../lib/format";
import styles from "./TimestampLink.module.css";

/** "0:46" — plays the recording from that moment. A button, because it acts instead of navigating. */
export function TimestampLink({ ms, onSeek, current }: { ms: number; onSeek: (ms: number) => void; current?: boolean }) {
  const time = formatDuration(ms);
  return (
    <button
      type="button"
      className={`tabular ${styles.link} ${current ? styles.current : ""}`}
      aria-label={`Play from ${time}`}
      onClick={(e) => { e.stopPropagation(); onSeek(ms); }}
    >
      {time}
    </button>
  );
}
