import { useState } from "react";
import type { LanguageCode, RecordingMode, SavedNotes } from "@vn/shared";
import { Button } from "./Button";
import { OwnerLine } from "./OwnerLine";
import styles from "./NotesEditor.module.css";

type ListKey = "keyPoints" | "decisions" | "reviewQuestions" | "ideas" | "proposals" | "openQuestions";
const LIST_LABEL: Record<ListKey, string> = {
  keyPoints: "Key points",
  decisions: "Decisions",
  reviewQuestions: "Review questions",
  ideas: "Ideas",
  proposals: "Suggested next steps",
  openQuestions: "Open questions",
};

type Props = {
  notes: SavedNotes;
  mode: RecordingMode;
  /** language of the notes' text (the labels stay English), so screen readers and spell-check get it right */
  lang: LanguageCode;
  editing: boolean;
  saving: boolean;
  /** the public shared page (Task 1.30): checkboxes show what's done but can't be changed */
  readOnly?: boolean;
  error: string | null;
  onSave: (notes: SavedNotes) => void;
  onCancel: () => void;
  onToggleDone: (index: number) => void;
};

export function NotesEditor(props: Props) {
  return props.editing ? <NotesForm {...props} /> : <NotesView {...props} />;
}

/* ---------- reading ---------- */

function NotesView({ notes, lang, onToggleDone, saving, readOnly }: Props) {
  const list = (key: ListKey) =>
    notes[key].length > 0 && (
      <section aria-labelledby={`h-${key}`} className={key === "decisions" ? styles.decisionCard : styles.card}>
        {key === "decisions" && <span className={styles.pin} aria-hidden="true" />}
        <h2 id={`h-${key}`} className={styles.heading}>{LIST_LABEL[key]}</h2>
        <ul className={styles.list} lang={lang}>{notes[key].map((item, i) => <li key={i}>{item}</li>)}</ul>
      </section>
    );

  return (
    <div className={styles.view}>
      {notes.summary && (
        <section aria-labelledby="h-summary" className={styles.card}>
          <h2 id="h-summary" className={styles.heading}>Summary</h2>
          <p className={styles.summary} lang={lang}>{notes.summary}</p>
        </section>
      )}

      {notes.actionItems.length > 0 && (
        <section aria-labelledby="h-actions" className={styles.todoCard}>
          <h2 id="h-actions" className={styles.heading}>Action items</h2>
          <div>
            {notes.actionItems.map((a, i) => (
              <label key={i} className={styles.item}>
                <input type="checkbox" className={styles.check} checked={a.done} disabled={saving || readOnly} onChange={() => onToggleDone(i)} />
                <span className={styles.itemText}>
                  <span className={a.done ? styles.done : undefined} lang={lang}>{a.text}</span>
                  <span className={styles.meta}><OwnerLine owner={a.owner} due={a.dueDate} lang={lang} /></span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {list("keyPoints")}
      {list("decisions")}

      {notes.concepts.length > 0 && (
        <section aria-labelledby="h-concepts" className={styles.card}>
          <h2 id="h-concepts" className={styles.heading}>Concepts</h2>
          <ul className={styles.list} lang={lang}>
            {notes.concepts.map((c, i) => <li key={i}><strong>{c.term}</strong>: {c.explanation}</li>)}
          </ul>
        </section>
      )}

      {list("reviewQuestions")}
      {list("ideas")}

      {notes.proposals.length > 0 && (
        <section aria-labelledby="h-proposals" className={styles.ideaCard}>
          <h2 id="h-proposals" className={styles.boxHeading}>Suggested next steps</h2>
          <p className={styles.boxNote}>Ideas from the assistant. Nobody said these in the meeting.</p>
          <ul className={styles.list} lang={lang}>{notes.proposals.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
      )}

      {list("openQuestions")}

      <p className={styles.disclaimer}>Notes are written by AI from the transcript. Check names and dates before you share them.</p>
    </div>
  );
}

/* ---------- editing ---------- */

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const orNull = (s: string) => s.trim() || null;

function NotesForm({ notes, mode, lang, saving, error, onSave, onCancel }: Props) {
  const [summary, setSummary] = useState(notes.summary);
  const [text, setText] = useState(() =>
    Object.fromEntries((Object.keys(LIST_LABEL) as ListKey[]).map((k) => [k, notes[k].join("\n")])) as Record<ListKey, string>,
  );
  const [items, setItems] = useState(() => notes.actionItems.map((a) => ({ ...a, owner: a.owner ?? "", dueDate: a.dueDate ?? "" })));
  const [concepts, setConcepts] = useState(notes.concepts);

  // mode-specific sections show for their mode, or whenever they already have content
  const showList = (k: ListKey) =>
    (k === "reviewQuestions" ? mode === "lesson" : k === "ideas" ? mode === "memo" : true) || notes[k].length > 0;
  const showConcepts = mode === "lesson" || notes.concepts.length > 0;

  function save() {
    onSave({
      ...notes,
      summary: summary.trim(),
      ...(Object.fromEntries((Object.keys(LIST_LABEL) as ListKey[]).map((k) => [k, lines(text[k])])) as Record<ListKey, string[]>),
      actionItems: items.filter((a) => a.text.trim()).map((a) => ({ text: a.text.trim(), owner: orNull(a.owner), dueDate: orNull(a.dueDate), done: a.done })),
      concepts: concepts.filter((c) => c.term.trim()).map((c) => ({ term: c.term.trim(), explanation: c.explanation.trim() })),
    });
  }

  const listField = (k: ListKey) =>
    showList(k) && (
      <div className={styles.field} key={k}>
        <label htmlFor={`f-${k}`} className={styles.label}>
          {LIST_LABEL[k]} <span className={styles.hint}>(one per line)</span>
        </label>
        <textarea
          id={`f-${k}`}
          lang={lang}
          className={styles.textarea}
          rows={Math.max(3, notes[k].length + 1)}
          value={text[k]}
          onChange={(e) => setText({ ...text, [k]: e.target.value })}
        />
      </div>
    );

  return (
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className={styles.field}>
        <label htmlFor="f-summary" className={styles.label}>Summary</label>
        <textarea id="f-summary" lang={lang} className={styles.textarea} rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Action items</legend>
        {items.map((a, i) => {
          const set = (patch: Partial<typeof a>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className={styles.row}>
              <input lang={lang} aria-label={`Action item ${i + 1}`} className={`${styles.input} ${styles.grow}`} value={a.text} onChange={(e) => set({ text: e.target.value })} />
              <input lang={lang} aria-label={`Owner of action item ${i + 1}`} placeholder="Owner" className={styles.input} value={a.owner} onChange={(e) => set({ owner: e.target.value })} />
              <input lang={lang} aria-label={`Due date of action item ${i + 1}`} placeholder="Due" className={styles.input} value={a.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              <Button type="button" variant="secondary" size="small" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          );
        })}
        <div>
          <Button type="button" variant="secondary" size="small" onClick={() => setItems([...items, { text: "", owner: "", dueDate: "", done: false }])}>
            Add action item
          </Button>
        </div>
      </fieldset>

      {listField("keyPoints")}
      {listField("decisions")}

      {showConcepts && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Concepts</legend>
          {concepts.map((c, i) => {
            const set = (patch: Partial<typeof c>) => setConcepts(concepts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className={styles.row}>
                <input lang={lang} aria-label={`Concept ${i + 1}`} placeholder="Term" className={styles.input} value={c.term} onChange={(e) => set({ term: e.target.value })} />
                <input lang={lang} aria-label={`Explanation of concept ${i + 1}`} placeholder="Short explanation" className={`${styles.input} ${styles.grow}`} value={c.explanation} onChange={(e) => set({ explanation: e.target.value })} />
                <Button type="button" variant="secondary" size="small" onClick={() => setConcepts(concepts.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            );
          })}
          <div>
            <Button type="button" variant="secondary" size="small" onClick={() => setConcepts([...concepts, { term: "", explanation: "" }])}>Add concept</Button>
          </div>
        </fieldset>
      )}

      {listField("reviewQuestions")}
      {listField("ideas")}
      {listField("proposals")}
      {listField("openQuestions")}

      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
