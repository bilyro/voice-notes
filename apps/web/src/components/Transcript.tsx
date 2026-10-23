import { useState } from "react";
import type { LanguageCode, TranscriptLine } from "@vn/shared";
import { formatDuration } from "../lib/format";
import { Button } from "./Button";
import { TimestampLink } from "./TimestampLink";
import styles from "./Transcript.module.css";

/**
 * `lang`: the language spoken (marks the text only; the timestamp buttons keep the English UI language).
 * `onEdit`: when given, every line gets a pencil to fix it (Task 1.38); it should throw if saving fails.
 */
type Props = {
  segments: TranscriptLine[];
  lang: LanguageCode;
  currentMs: number | null;
  onSeek: (ms: number) => void;
  onEdit?: (segmentId: string, text: string) => Promise<void>;
};

/** One row per segment; clicking a row plays from there; the row being played is highlighted. */
export function Transcript({ segments, lang, currentMs, onSeek, onEdit }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the playing row: the last one that started at or before the current time
  let playing = -1;
  if (currentMs !== null) segments.forEach((s, i) => { if (s.startMs <= currentMs) playing = i; });

  if (segments.length === 0) return <p className="muted">No speech was found in this recording.</p>;

  function open(s: TranscriptLine) {
    setEditing(s.id);
    setDraft(s.text);
    setError(null);
  }
  async function save(id: string) {
    if (!draft.trim()) return setError("A line can't be empty.");
    setSaving(true);
    try {
      await onEdit!(id, draft.trim());
      setEditing(null);
    } catch {
      setError("The line could not be saved. Check your connection, then try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ol className={styles.list}>
      {segments.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === playing ? "true" : undefined}
          className={`${styles.row} ${onEdit ? styles.editable : ""}`}
          onClick={() => { if (editing !== s.id) onSeek(s.startMs); }}
        >
          <TimestampLink ms={s.startMs} onSeek={onSeek} current={i === playing} />
          {editing === s.id ? (
            // editing: clicks here don't seek
            <div className={styles.editor} onClick={(e) => e.stopPropagation()}>
              <label htmlFor={`line-${s.id}`} className="visually-hidden">Line at {formatDuration(s.startMs)}</label>
              <textarea
                id={`line-${s.id}`}
                className={styles.textarea}
                lang={lang}
                rows={Math.max(2, Math.ceil(draft.length / 70))}
                value={draft}
                autoFocus
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(null);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save(s.id);
                }}
              />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={styles.editButtons}>
                <Button size="small" onClick={() => void save(s.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                <Button size="small" variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div>
              {s.speaker && <div className={styles.speaker}>{s.speaker}</div>}
              <p className={styles.text} lang={lang}>{s.text}</p>
            </div>
          )}
          {onEdit && editing !== s.id && (
            <button
              type="button"
              className={styles.edit}
              aria-label={`Edit the line at ${formatDuration(s.startMs)}`}
              title="Edit this line"
              onClick={(e) => { e.stopPropagation(); open(s); }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></svg>
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
