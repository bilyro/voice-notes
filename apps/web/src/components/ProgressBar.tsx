import styles from "./ProgressBar.module.css";

/** 4px bar, `value` 0–1. Decorative: the text next to it says what is happening. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={[styles.track, className].filter(Boolean).join(" ")} aria-hidden="true">
      <span className={styles.fill} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  );
}
