import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notesToMarkdown, SavedNotes, type Recording, type RecordingMode, type Segment } from "@vn/shared";
import { AudioPlayer, type AudioPlayerHandle } from "../components/AudioPlayer";
import { Button } from "../components/Button";
import { NotesEditor } from "../components/NotesEditor";
import { Tabs } from "../components/Tabs";
import { Transcript } from "../components/Transcript";
import { api } from "../lib/api";
import { failureText } from "../lib/status";
import page from "./Page.module.css";
import styles from "./RecordingDetailPage.module.css";

type Detail = {
  recording: Recording;
  segments: Segment[];
  notes: { version: number; editedByUser: boolean; content: unknown } | null;
};

const MODE_LABEL: Record<RecordingMode, string> = { meeting: "Meeting", lesson: "Lesson", memo: "Voice memo" };
const PROCESSING: Recording["status"][] = ["uploaded", "transcribing", "summarizing"];
const STEPS: { status: Recording["status"]; label: string }[] = [
  { status: "uploaded", label: "Uploaded" },
  { status: "transcribing", label: "Transcribing" },
  { status: "summarizing", label: "Writing notes" },
  { status: "ready", label: "Ready" },
];

/** "Science fair: planning!" → "science-fair-planning.md" */
const fileName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "notes"}.md`;

/** 100_000 → "1 min 40 s" */
function longDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h} h`, m && `${m} min`, (sec || (!h && !m)) && `${sec} s`].filter(Boolean).join(" ");
}

export function RecordingDetailPage() {
  const { id } = useParams() as { id: string };
  const queryClient = useQueryClient();
  const key = ["recording", id];
  const player = useRef<AudioPlayerHandle>(null);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const confirmPanel = useRef<HTMLElement>(null);

  const { data, error } = useQuery({
    queryKey: key,
    queryFn: () => api<Detail>(`/recordings/${id}`),
    refetchInterval: (q) => (PROCESSING.includes(q.state.data?.recording.status ?? "ready") ? 2000 : false),
  });
  const hasAudio = !!data && (data.recording.status === "ready" || data.segments.length > 0);
  const audio = useQuery({
    queryKey: ["recording-audio", id],
    queryFn: () => api<{ url: string }>(`/recordings/${id}/audio`),
    enabled: hasAudio,
    staleTime: 50 * 60 * 1000,          // the signed URL is valid for an hour
  });

  const save = useMutation({
    mutationFn: (notes: SavedNotes) =>
      api<{ version: number }>(`/recordings/${id}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notes),
      }),
    // show the change at once (ticking a box should feel instant); roll back if saving fails
    onMutate: async (notes) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Detail>(key);
      queryClient.setQueryData<Detail>(key, (d) => d && { ...d, notes: { version: d.notes?.version ?? 0, editedByUser: true, content: notes } });
      return { previous };
    },
    onError: (_e, _notes, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      setSaveError("The notes could not be saved. Check your connection, then try again.");
    },
    onSuccess: () => setEditing(false),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const retry = useMutation({
    mutationFn: () => api(`/recordings/${id}/retry`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: () => api(`/recordings/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      // stop polling first, or a refetch of the deleted recording would flash "not found"
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Recording[]>(["recordings"], (list) => list?.filter((r) => r.id !== id));
      navigate("/", { replace: true });
      queryClient.removeQueries({ queryKey: key });
      queryClient.removeQueries({ queryKey: ["recording-audio", id] });
      void queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });

  // the confirmation takes focus when it opens, so keyboard and screen-reader users land on the question
  useEffect(() => {
    if (confirming) confirmPanel.current?.focus();
  }, [confirming]);

  function closeConfirm() {
    setConfirming(false);
    remove.reset();
    deleteButton.current?.focus();
  }

  if (error) {
    return (
      <div className={`${page.page} ${page.detail}`}>
        <BackLink />
        <p className={styles.error}>{error.message === "Recording not found" ? "This recording does not exist or was deleted." : "The recording could not be loaded. Check your connection, then reload the page."}</p>
      </div>
    );
  }
  if (!data) return <div className={`${page.page} ${page.detail}`}><BackLink /></div>;

  const rec = data.recording;
  const notes = data.notes ? SavedNotes.parse(data.notes.content) : null;   // fills in done: false for AI notes
  const seek = (ms: number) => player.current?.seek(ms);
  const longDate = new Date(rec.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const markdown = () => notesToMarkdown(rec.title, notes!, longDate);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    setTimeout(() => setCopy("idle"), 2500);
  }

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName(rec.title) });
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggleDone = (i: number) =>
    notes && save.mutate({ ...notes, actionItems: notes.actionItems.map((a, j) => (j === i ? { ...a, done: !a.done } : a)) });

  return (
    <div className={`${page.page} ${page.detail}`}>
      <BackLink />
      <h1 className={styles.title}>{rec.title}</h1>
      <div className={styles.meta}>
        <span className={styles.chip}>{MODE_LABEL[rec.mode]}</span>
        <span>{longDate}</span>
        {rec.durationMs !== null && <span className="tabular">{longDuration(rec.durationMs)}</span>}
      </div>

      <div className={styles.actions}>
        {rec.status === "ready" && notes && !editing && (
          <>
            <Button variant="secondary" onClick={copyMarkdown}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
              {copy === "copied" ? "Copied" : "Copy as Markdown"}
            </Button>
            <Button variant="secondary" onClick={downloadMarkdown}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
              Download .md
            </Button>
            <Button variant="secondary" onClick={() => { setTab("notes"); setEditing(true); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></svg>
              Edit notes
            </Button>
          </>
        )}
        {/* every status can be deleted: a failed or stuck recording should not stay forever */}
        <Button
          ref={deleteButton}
          variant="secondary"
          className={styles.deleteButton}
          aria-expanded={confirming}
          aria-controls="confirm-delete"
          onClick={() => (confirming ? closeConfirm() : setConfirming(true))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
          Delete
        </Button>
      </div>

      {confirming && (
        <section
          id="confirm-delete"
          ref={confirmPanel}
          tabIndex={-1}
          aria-labelledby="confirm-delete-title"
          className={styles.confirm}
          onKeyDown={(e) => { if (e.key === "Escape" && !remove.isPending) closeConfirm(); }}
        >
          <h2 id="confirm-delete-title" className={styles.confirmTitle}>Delete “{rec.title}”?</h2>
          <p className={styles.confirmText}>The audio, transcript and notes are removed for good. This can’t be undone.</p>
          {remove.error && <p className={styles.error} role="alert">{remove.error.message}</p>}
          <div className={styles.confirmButtons}>
            {/* black, not red: red is reserved for recording and error text (DESIGN.md §1) */}
            <Button onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete recording"}
            </Button>
            <Button variant="secondary" onClick={closeConfirm} disabled={remove.isPending}>Keep it</Button>
          </div>
        </section>
      )}

      <p className={`visually-hidden`} role="status">{copy === "copied" ? "Notes copied as Markdown" : ""}</p>
      {copy === "failed" && <p className={`${styles.error} ${styles.copyError}`} role="alert">Copying is blocked in this browser. Use Download .md instead.</p>}

      {PROCESSING.includes(rec.status) && (
        <ol className={styles.steps} aria-label="Processing">
          {STEPS.map((s, i) => {
            const current = STEPS.findIndex((x) => x.status === rec.status);
            const state = i < current ? "done" : i === current ? "current" : "next";
            return (
              <li key={s.status} className={styles[state]} aria-current={state === "current" ? "step" : undefined}>
                {state === "done" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
      {PROCESSING.includes(rec.status) && <p className={`muted ${styles.wait}`}>You can leave this page. Notes appear here when they are ready.</p>}

      {rec.status === "failed" && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(rec.error)}</p>
          <Button variant="secondary" size="small" onClick={() => retry.mutate()} disabled={retry.isPending}>Try again</Button>
        </div>
      )}
      {rec.status === "recording" && <p className={`muted ${styles.wait}`}>This recording was not finished, so there is nothing to process.</p>}

      {hasAudio && audio.data && (
        <div className={styles.player}>
          <AudioPlayer ref={player} src={audio.data.url} durationMs={rec.durationMs} onTime={setTimeMs} />
        </div>
      )}

      {rec.status === "ready" && notes ? (
        <Tabs
          label="Recording content"
          tabs={[{ value: "notes", label: "Notes" }, { value: "transcript", label: "Transcript" }]}
          value={tab}
          onChange={setTab}
        >
          {tab === "notes" ? (
            <>
              {saveError && !editing && <p className={`${styles.error} ${styles.saveError}`} role="alert">{saveError}</p>}
              <NotesEditor
                notes={notes}
                mode={rec.mode}
                editing={editing}
                saving={save.isPending}
                error={saveError}
                onSave={(n) => save.mutate(n)}
                onCancel={() => { setEditing(false); setSaveError(null); }}
                onToggleDone={toggleDone}
              />
            </>
          ) : (
            <div className={styles.transcript}>
              <Transcript segments={data.segments} currentMs={timeMs} onSeek={seek} />
            </div>
          )}
        </Tabs>
      ) : (
        data.segments.length > 0 && (
          <section aria-labelledby="h-transcript" className={styles.transcriptOnly}>
            <h2 id="h-transcript">Transcript</h2>
            <Transcript segments={data.segments} currentMs={timeMs} onSeek={seek} />
          </section>
        )
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className={styles.back}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      Recordings
    </Link>
  );
}
