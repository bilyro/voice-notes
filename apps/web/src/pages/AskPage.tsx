import { Fragment, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { AskAnswer, Recording } from "@vn/shared";
import { Button } from "../components/Button";
import { InfoNote } from "../components/InfoNote";
import { api, ApiError } from "../lib/api";
import { formatDuration } from "../lib/format";
import page from "./Page.module.css";
import styles from "./AskPage.module.css";

const MAX = 500;

/** "It costs £700[1][2]." → the text with each [n] as a small link to source n. */
function Cited({ text }: { text: string }) {
  return text.split(/(\[\d+\])/).map((part, i) => {
    const n = /^\[(\d+)\]$/.exec(part)?.[1];
    return n
      ? <a key={i} href={`#source-${n}`} className={styles.cite} aria-label={`Source ${n}`}>{n}</a>
      : <Fragment key={i}>{part}</Fragment>;
  });
}

/** Paragraphs, and "- " lines as a list (the model writes plain text, Task 2.3). */
function AnswerText({ text }: { text: string }) {
  const blocks: (string | string[])[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const item = /^[-•]\s+(.*)$/.exec(line)?.[1];
    const last = blocks.at(-1);
    if (item === undefined) blocks.push(line);
    else if (Array.isArray(last)) last.push(item);
    else blocks.push([item]);
  }
  return blocks.map((b, i) =>
    Array.isArray(b)
      ? <ul key={i} className={styles.list}>{b.map((item, j) => <li key={j}><Cited text={item} /></li>)}</ul>
      : <p key={i}><Cited text={b} /></p>,
  );
}

/** Ask a question about your recordings, or about one of them (`?recording=`). Task 2.3. */
export function AskPage() {
  // the question lives in the URL (?q=), so Back from a source returns to the answer (kept in the query cache)
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const recordingId = params.get("recording") ?? undefined;
  const [text, setText] = useState(q);
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {                                    // Back/Forward to another question: show it in the box
    setShownQ(q);
    setText(q);
  }

  const { data: appConfig } = useQuery({ queryKey: ["app-config"], queryFn: () => api<{ freeMode: boolean }>("/app-config") });
  const scope = useQuery({
    queryKey: ["recording", recordingId],
    queryFn: () => api<{ recording: Recording }>(`/recordings/${recordingId}`),
    enabled: !!recordingId,
  });
  const answer = useQuery({
    queryKey: ["ask", recordingId ?? "all", q],
    queryFn: () => api<AskAnswer>("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, recordingId }),
    }),
    enabled: q.length >= 2,
    staleTime: Infinity,                                 // an answer is asked for once, not refetched
    gcTime: 30 * 60_000,
    retry: false,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const question = text.trim();
    if (question.length < 2) return;
    setParams(recordingId ? { recording: recordingId, q: question } : { q: question });
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter asks, Shift+Enter starts a new line
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  const title = scope.data?.recording.title;
  const busy = answer.isFetching;
  const error = answer.error
    ? answer.error instanceof ApiError && answer.error.status !== 500 ? answer.error.message : "The question couldn't be asked. Check your connection, then try again."
    : null;

  return (
    <div className={`${page.page} ${styles.page}`}>
      <h1>{recordingId ? "Ask about this recording" : "Ask your recordings"}</h1>
      {recordingId && (
        <p className={styles.scope}>
          {scope.error ? "This recording isn't available." : <>Only “<Link to={`/recordings/${recordingId}`}>{title ?? "…"}</Link>”.</>}{" "}
          <Link to="/ask">Ask all recordings</Link>
        </p>
      )}

      {appConfig?.freeMode && (
        <div className={styles.note}>
          <InfoNote>Free plan: your question and the parts of your transcripts that match it are sent to a free service with no privacy guarantee.</InfoNote>
        </div>
      )}

      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="question" className={styles.label}>Your question</label>
        <textarea
          id="question"
          className={styles.input}
          rows={3}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby="question-hint"
          placeholder={recordingId ? "For example: What did we decide?" : "For example: What did we decide about the school trip?"}
        />
        <p id="question-hint" className={styles.hint}>
          Answers come only from your transcripts, with links to the moments they come from.
          {text.length > MAX - 50 && <span className="tabular"> {text.length}/{MAX}</span>}
        </p>
        <div>
          <Button type="submit" disabled={busy || text.trim().length < 2}>{busy ? "Asking…" : "Ask"}</Button>
        </div>
      </form>

      <p role="status" className={busy ? styles.status : "visually-hidden"}>
        {busy ? "Looking through your recordings…" : answer.data ? "Answer ready." : ""}
      </p>
      {error && !busy && <p className={styles.error} role="alert">{error}</p>}

      {answer.data && !busy && (
        <section aria-labelledby="answer-title" className={styles.card}>
          <h2 id="answer-title" className={styles.question}>{q}</h2>
          {answer.data.found ? (
            <div className={styles.answer}><AnswerText text={answer.data.answer} /></div>
          ) : (
            <>
              <p className={styles.answer}>{answer.data.answer}</p>
              <p className={styles.hint}>Try other words, or ask about one recording from its page.</p>
            </>
          )}

          {answer.data.sources.length > 0 && (
            <>
              <h3 className={styles.sourcesTitle}>Sources</h3>
              <ol className={styles.sources}>
                {answer.data.sources.map((s) => (
                  <li key={s.n} id={`source-${s.n}`} className={styles.source}>
                    <span className={styles.n} aria-hidden="true">{s.n}</span>
                    <div className={styles.sourceMain}>
                      <div className={styles.sourceHead}>
                        <Link to={`/recordings/${s.recordingId}?t=${s.startMs}`} className={`tabular ${styles.time}`} aria-label={`Play “${s.title}” from ${formatDuration(s.startMs)}`}>
                          {formatDuration(s.startMs)}
                        </Link>
                        <Link to={`/recordings/${s.recordingId}`} className={styles.sourceTitle}>{s.title}</Link>
                      </div>
                      <p className={styles.sourceText} lang={s.language}>{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
