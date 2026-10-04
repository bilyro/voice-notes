import type { ReactNode } from "react";
import styles from "./Auth.module.css";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.logo}>
        <span className={styles.dot} aria-hidden="true" />
        Voice notes
      </div>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
