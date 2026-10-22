import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionItemStatus, type ActionItemEntry, type RecordingMode } from "@vn/shared";
import { FilterPills } from "../components/FilterPills";
import { OwnerLine } from "../components/OwnerLine";
import { api } from "../lib/api";
import { shortDate } from "../lib/dates";
import notesStyles from "../components/NotesEditor.module.css";
import page from "./Page.module.css";
import styles from "./ActionItemsPage.module.css";

const STATUSES: { value: ActionItemStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];
const EMPTY: Record<ActionItemStatus, string> = {
  open: "Nothing open. Nice.",
  done: "Nothing ticked off yet.",
  all: "No action items yet. They appear when a recording's notes are ready.",
};
const MODE_LABEL: Record<RecordingMode, string> = { meeting: "Meeting", lesson: "Lesson", memo: "Voice memo" };
const NO_OWNER = "-";             // the owner filter's value for items nobody owns

/** Every action item from every recording (Task 1.29). Ticking one saves that recording's notes, like on its page. */
export function ActionItemsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = ActionItemStatus.catch("open").parse(params.get("status") ?? "open");
  const owner = params.get("owner") ?? "";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const key = ["action-items", status];
  const { data, error } = useQuery({ queryKey: key, queryFn: () => api<ActionItemEntry[]>(`/action-items?status=${status}`) });

  const toggle = useMutation({
    mutationFn: (item: ActionItemEntry) =>
      api(`/action-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !item.done }) }),
    // tick at once (in "Open" it stays, struck through, until the list reloads); roll back if saving fails
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ActionItemEntry[]>(key);
      queryClient.setQueryData<ActionItemEntry[]>(key, (list) => list?.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
      return { previous };
    },
    onError: (_e, _item, ctx) => { if (ctx?.previous) queryClient.setQueryData(key, ctx.previous); },
    onSettled: (_d, _e, item) => {
      void queryClient.invalidateQueries({ queryKey: ["action-items"] });
      void queryClient.invalidateQueries({ queryKey: ["recording", item.recording.id] });
    },
  });

  const owners = [...new Set((data ?? []).map((i) => i.owner).filter((o): o is string => !!o))].sort((a, b) => a.localeCompare(b));
  const shown = (data ?? []).filter((i) => !owner || (owner === NO_OWNER ? !i.owner : i.owner === owner));
  // group by recording; the API sends the newest recording first
  const groups = new Map<string, ActionItemEntry[]>();
  for (const i of shown) groups.set(i.recording.id, [...(groups.get(i.recording.id) ?? []), i]);

  return (
    <div className={`${page.page} ${page.list}`}>
      <h1>Action items</h1>
      <div className={styles.controls}>
        <FilterPills label="Show" options={STATUSES} value={status} onChange={(v) => set({ status: v === "open" ? "" : v })} />
        {(owners.length > 0 || owner) && (
          <label className={styles.owner}>
            <span>Owner</span>
            <select className={styles.select} value={owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="">Everyone</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
              <option value={NO_OWNER}>No owner</option>
            </select>
          </label>
        )}
      </div>

      {toggle.error && (
        <p className={styles.error} role="alert">
          {toggle.error.message.startsWith("These notes were changed") ? toggle.error.message : "That couldn't be saved. Check your connection, then try again."}
        </p>
      )}
      {error && <p className={styles.error}>The action items could not be loaded. Check your connection, then reload the page.</p>}
      {data && shown.length === 0 && <p className={`muted ${styles.none}`} role="status">{owner ? "Nothing here for this owner." : EMPTY[status]}</p>}

      {[...groups].map(([id, items]) => {
        const rec = items[0]!.recording;
        return (
          <section key={id} aria-labelledby={`group-${id}`} className={`${notesStyles.todoCard} ${styles.group}`}>
            <h2 id={`group-${id}`} className={styles.groupTitle}>
              <Link to={`/recordings/${id}`}>{rec.title}</Link>
            </h2>
            <p className={styles.groupMeta}>{MODE_LABEL[rec.mode]} · {shortDate(new Date(rec.createdAt))}</p>
            <div>
              {items.map((a) => (
                <label key={a.id} className={notesStyles.item}>
                  <input type="checkbox" className={notesStyles.check} checked={a.done} disabled={toggle.isPending} onChange={() => toggle.mutate(a)} />
                  <span className={notesStyles.itemText}>
                    <span className={a.done ? notesStyles.done : undefined} lang={rec.language}>{a.text}</span>
                    <span className={notesStyles.meta}><OwnerLine owner={a.owner} due={a.dueDate} lang={rec.language} /></span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
