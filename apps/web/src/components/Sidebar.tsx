import { Link, NavLink, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { ActionItemEntry, Recording, RecordingMode } from "@vn/shared";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { ButtonLink } from "./Button";
import { LogoMark } from "./LogoMark";
import styles from "./Sidebar.module.css";

const MODE_LABEL: Record<RecordingMode, string> = { meeting: "Meeting", lesson: "Lesson", memo: "Voice memo" };
const PROCESSING: Recording["status"][] = ["uploaded", "transcribing", "summarizing"];

/** "Meeting · Thu", or the step while it is still being processed. */
function recentMeta(r: Recording) {
  if (r.status === "summarizing") return "Writing notes…";
  if (r.status === "uploaded" || r.status === "transcribing") return "Transcribing…";
  if (r.status === "recording") return "Not finished";
  if (r.status === "failed") return "Processing failed";
  return `${MODE_LABEL[r.mode]} · ${new Date(r.createdAt).toLocaleDateString("en-US", { weekday: "short" })}`;
}

/** "Dana Ortiz" → "DO", "dana@school.org" → "DA" */
function initials(name: string | undefined, email: string | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? email ?? "?").slice(0, 2).toUpperCase();
}

// Design canvas, "Sidebar: 3 options", option A. Action items, Settings and the
// minutes meter arrive with their tasks (docs/DESIGN.md section 6).
export function Sidebar() {
  const navigate = useNavigate();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  // the same query (and cache) as the Recordings page; polls only while something is processing
  const { data: recordings } = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api<Recording[]>("/recordings"),
    refetchInterval: (q) => (q.state.data?.some((r) => PROCESSING.includes(r.status)) ? 3000 : false),
  });
  const recent = recordings?.slice(0, 3) ?? [];
  // the same query (and cache) as the Action items page's "Open" view
  const { data: openItems } = useQuery({ queryKey: ["action-items", "open"], queryFn: () => api<ActionItemEntry[]>("/action-items?status=open") });   // the API returns newest first

  async function signOut() {
    await authClient.signOut();
    // clear the shared session store first: /login sends signed-in visitors on to "/", and the old
    // session would otherwise still be cached there (you'd land on the landing page instead)
    await refetchSession();
    navigate("/login", { replace: true });
  }

  return (
    <aside className={styles.sidebar}>
      <Link to="/about" className={styles.logo} title="About Voice notes">
        <LogoMark />
        Voice notes
      </Link>

      <ButtonLink to="/record" block>
        <span className={styles.dotOnDark} aria-hidden="true" />
        New recording
      </ButtonLink>

      <nav aria-label="Main" className={styles.nav}>
        <NavLink to="/" end className={styles.navItem}>
          All recordings
          {recordings && <span className={styles.count}>{recordings.length}</span>}
        </NavLink>
        <NavLink to="/action-items" className={styles.navItem}>
          Action items
          {openItems && <span className={styles.count} aria-label={`${openItems.length} open`}>{openItems.length}</span>}
        </NavLink>
      </nav>

      {recent.length > 0 && (
        <section aria-labelledby="sidebar-recent" className={styles.recent}>
          <h2 id="sidebar-recent" className={styles.recentTitle}>Recent</h2>
          {recent.map((r) => (
            <NavLink key={r.id} to={`/recordings/${r.id}`} className={styles.recentCard} data-mode={r.mode}>
              <span className={styles.recentName}>{r.title}</span>
              <span className={styles.recentMeta}>{recentMeta(r)}</span>
            </NavLink>
          ))}
        </section>
      )}

      <div className={styles.account}>
        {/* the account page (Task 1.36) */}
        <Link to="/account" className={styles.accountLink} title="Your account">
          <span className={styles.avatar} aria-hidden="true">{initials(session?.user.name, session?.user.email)}</span>
          <span className={styles.email}>{session?.user.email}</span>
        </Link>
        <button type="button" className={styles.signOut} aria-label="Sign out" title="Sign out" onClick={signOut}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 4h4v16h-4" />
            <path d="M10 8l-4 4 4 4" />
            <path d="M6 12h10" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
