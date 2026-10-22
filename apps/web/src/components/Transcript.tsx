import type { LanguageCode, Segment } from "@vn/shared";
import { TimestampLink } from "./TimestampLink";
import styles from "./Transcript.module.css";

/** `lang`: the language spoken (marks the text only; the timestamp buttons keep the English UI language) */
type Props = { segments: Segment[]; lang: LanguageCode; currentMs: number | null; onSeek: (ms: number) => void };

/** One row per segment; clicking a row plays from there; the row being played is highlighted. */
export function Transcript({ segments, lang, currentMs, onSeek }: Props) {
  // the playing row: the last one that started at or before the current time
  let playing = -1;
  if (currentMs !== null) segments.forEach((s, i) => { if (s.startMs <= currentMs) playing = i; });

  if (segments.length === 0) return <p className="muted">No speech was found in this recording.</p>;

  return (
    <ol className={styles.list}>
      {segments.map((s, i) => (
        <li
          key={i}
          aria-current={i === playing ? "true" : undefined}
          className={styles.row}
          onClick={() => onSeek(s.startMs)}
        >
          <TimestampLink ms={s.startMs} onSeek={onSeek} current={i === playing} />
          <div>
            {s.speaker && <div className={styles.speaker}>{s.speaker}</div>}
            <p className={styles.text} lang={lang}>{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
