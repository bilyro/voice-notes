import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Recording, RecordingMode, SearchResult } from "@vn/shared";
import { ButtonLink } from "../components/Button";
import { FilterPills } from "../components/FilterPills";
import { Snippet } from "../components/Snippet";
import { StatusLabel } from "../components/StatusLabel";
import { api } from "../lib/api";
import { groupLabel, shortDate } from "../lib/dates";
import { formatDuration } from "../lib/format";
import page from "./Page.module.css";
import styles from "./RecordingsPage.module.css";

type Filter = "all" | RecordingMode;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "meeting", label: "Meetings" },
  { value: "lesson", label: "Lessons" },
  { value: "memo", label: "Voice memos" },
];
const MODE_LABEL: Record<RecordingMode, string> = { meeting: "Meeting", lesson: "Lesson", memo: "Voice memo" };
const PROCESSING: Recording["status"][] = ["uploaded", "transcribing", "summarizing"];

export function RecordingsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const queryClient = useQueryClient();

  // search (Task 1.28): the query lives in the URL (?q=), so Back from a recording returns to the results
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => {
      if (text.trim() !== q) setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [text, q, setParams]);
  const searching = q.length >= 2;
  const search = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
    enabled: searching,
    placeholderData: (previous) => previous,   // keep the old results on screen while the next ones load
  });

  const { data, error } = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api<Recording[]>("/recordings"),
    // poll only while something is still processing (a never-finished recording would poll forever)
    refetchInterval: (q) => (q.state.data?.some((r) => PROCESSING.includes(r.status)) ? 3000 : false),
  });

  const retry = useMutation({
    mutationFn: (id: string) => api(`/recordings/${id}/retry`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recordings"] }),
  });

  if (error) {
    return (
      <div className={`${page.page} ${page.list}`}>
        <h1>Recordings</h1>
        <p className={styles.error}>The recordings could not be loaded. Check your connection, then reload the page.</p>
      </div>
    );
  }
  if (!data) return <div className={`${page.page} ${page.list}`}><h1>Recordings</h1></div>;

  if (data.length === 0) {
    return (
      <div className={`${page.page} ${page.list}`}>
        <h1>Recordings</h1>
        <div className={page.empty}>
          <p className="muted">No recordings yet</p>
          <ButtonLink to="/record">New recording</ButtonLink>
        </div>
      </div>
    );
  }

  const searchField = (
    <div className={styles.search}>
      <label htmlFor="search" className="visually-hidden">Search recordings</label>
      <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <input
        id="search"
        type="search"
        className={styles.searchInput}
        placeholder="Search titles, transcripts and notes"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
  const filters = (
    <div className={styles.filters}>
      <FilterPills label="Filter by type" options={FILTERS} value={filter} onChange={setFilter} />
    </div>
  );

  if (searching) {
    const results = (search.data ?? []).filter((r) => filter === "all" || r.recording.mode === filter);
    // the previous query's results stay on screen while these load: dimmed, marked busy, never called "no match"
    const stale = !search.data || search.isPlaceholderData;
    return (
      <div className={`${page.page} ${page.list}`}>
        <h1>Recordings</h1>
        {searchField}
        {filters}
        {search.error ? (
          <p className={styles.error}>Search didn't work. Check your connection, then try again.</p>
        ) : !stale && results.length === 0 ? (
          <p className={`muted ${styles.none}`} role="status">No recordings match “{q}”</p>
        ) : (
          <section aria-label={`Search results for ${q}`} aria-busy={stale} className={`${styles.group} ${stale ? styles.stale : ""}`}>
            <p className={styles.groupTitle} role="status">{stale ? "Searching…" : `${results.length} ${results.length === 1 ? "recording" : "recordings"} found`}</p>
            <ul className={styles.rows}>
              {results.map(({ recording: r, matches }) => {
                const title = matches.find((m) => m.kind === "title");
                return (
                  <li key={r.id} className={styles.row}>
                    <span className={styles.tile} data-mode={r.mode} aria-hidden="true"><ModeIcon mode={r.mode} /></span>
                    <div className={styles.main}>
                      <Link to={`/recordings/${r.id}`} className={styles.title}>{title ? <Snippet text={title.snippet} /> : r.title}</Link>
                      <div className={styles.meta}>{MODE_LABEL[r.mode]}, {shortDate(new Date(r.createdAt))}</div>
                      <ul className={styles.matches}>
                        {matches.filter((m) => m.kind !== "title").map((m, i) => (
                          <li key={i} className={styles.match}>
                            {(m.kind === "transcript" || m.kind === "meaning") && m.startMs !== undefined ? (
                              <Link to={`/recordings/${r.id}?t=${m.startMs}`} className={styles.time} aria-label={`Play from ${formatDuration(m.startMs)}`}>
                                {formatDuration(m.startMs)}
                              </Link>
                            ) : (
                              <span className={styles.kind}>Notes</span>
                            )}
                            {m.kind === "meaning" && <span className={styles.similar}>Similar meaning</span>}
                            <Snippet text={m.snippet} lang={r.language} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const shown = filter === "all" ? data : data.filter((r) => r.mode === filter);
  // the API returns newest first, so groups come out in order
  const groups = new Map<string, Recording[]>();
  for (const r of shown) {
    const label = groupLabel(new Date(r.createdAt));
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }

  return (
    <div className={`${page.page} ${page.list}`}>
      <h1>Recordings</h1>
      {searchField}
      {filters}

      {shown.length === 0 && <p className={`muted ${styles.none}`}>No {FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} yet</p>}

      {[...groups].map(([label, recs], i) => (
        <section key={label} aria-labelledby={`group-${i}`} className={styles.group}>
          <h2 id={`group-${i}`} className={styles.groupTitle}>{label}</h2>
          <ul className={styles.rows}>
            {recs.map((r) => (
              <li key={r.id} className={styles.row}>
                <span className={styles.tile} data-mode={r.mode} aria-hidden="true"><ModeIcon mode={r.mode} /></span>
                <div className={styles.main}>
                  <Link to={`/recordings/${r.id}`} className={styles.title}>{r.title}</Link>
                  <div className={styles.meta}>
                    {MODE_LABEL[r.mode]}
                    {r.durationMs !== null && `, ${Math.max(1, Math.round(r.durationMs / 60_000))} min`}
                  </div>
                </div>
                <span className={styles.status}>
                  <StatusLabel recording={r} onRetry={() => retry.mutate(r.id)} retrying={retry.isPending && retry.variables === r.id} />
                </span>
                <span className={styles.date}>{shortDate(new Date(r.createdAt))}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ModeIcon({ mode }: { mode: RecordingMode }) {
  const paths = {
    meeting: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 19c.8-3 3.2-5 6-5s5.2 2 6 5" /><path d="M15 14.5c2.6 0 4.6 1.6 5.2 4.5" /></>,
    lesson: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 21H20" /></>,
    memo: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[mode]}
    </svg>
  );
}
