import styles from "./LogoMark.module.css";

/** The logo mark: a small tilted index card, red record dot as the first bullet, then lines of writing (same drawing as the app icon). */
export function LogoMark() {
  return (
    <span className={styles.card} aria-hidden="true">
      <span className={styles.row}><span className={styles.dot} /><span className={styles.line} /></span>
      <span className={styles.lineLong} />
      <span className={styles.lineShort} />
    </span>
  );
}
