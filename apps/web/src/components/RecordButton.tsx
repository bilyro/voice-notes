import type { ButtonHTMLAttributes } from "react";
import styles from "./RecordButton.module.css";

type Props = { action: "start" | "stop"; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/** Red circle with a white dot (start) or a white rounded square (stop), and a visible label below. */
export function RecordButton({ action, label, className, ...props }: Props) {
  return (
    <button type="button" className={[styles.button, styles[action], className].filter(Boolean).join(" ")} {...props}>
      <span className={styles.circle} aria-hidden="true">
        <span className={styles.icon} />
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
