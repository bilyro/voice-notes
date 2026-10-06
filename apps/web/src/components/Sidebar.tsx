import { Link, NavLink, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { Button, ButtonLink } from "./Button";
import { LogoMark } from "./LogoMark";
import styles from "./Sidebar.module.css";

// Only Recordings and New recording for now. Action items, Settings and the
// minutes meter arrive with their tasks (docs/DESIGN.md section 6).
export function Sidebar() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  async function signOut() {
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <aside className={styles.sidebar}>
      <Link to="/" className={styles.logo}>
        <LogoMark />
        Voice notes
      </Link>

      <ButtonLink to="/record" block>
        <span className={styles.dotOnDark} aria-hidden="true" />
        New recording
      </ButtonLink>

      <nav aria-label="Main" className={styles.nav}>
        <NavLink to="/" end className={styles.navItem}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <rect x="4" y="5" width="16" height="12" rx="1.5" />
            <path d="M7 20h10" />
          </svg>
          Recordings
        </NavLink>
      </nav>

      <div className={styles.footer}>
        <span className={`muted ${styles.email}`}>{session?.user.email}</span>
        <Button variant="secondary" size="small" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </aside>
  );
}
