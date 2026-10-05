import type { ReactNode } from "react";
import styles from "./InfoNote.module.css";

/** Grey note for calm, important information (e.g. the Free plan notice). */
export function InfoNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
