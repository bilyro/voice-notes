import type { ReactNode } from "react";
import { Link } from "react-router";
import { LogoMark } from "../components/LogoMark";
import styles from "./Auth.module.css";

/** Sign in / sign up: form card on the right, example cards on the board to the left (stacks under the form on a phone). */
export function AuthLayout({ title, subtitle, panel, children }: { title: string; subtitle: string; panel: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.page}>
      {/* the form comes first in the HTML (row-reverse puts it on the right), so Tab and screen readers reach it first */}
      <main className={styles.formColumn}>
        <Link to="/" className={styles.logo}>
          <LogoMark />
          Voice notes
        </Link>
        <div className={styles.formBox}>
          <h1>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {children}
        </div>
      </main>
      <aside aria-label="What you get" className={styles.panel}>
        <div className={styles.panelBox}>{panel}</div>
      </aside>
    </div>
  );
}
