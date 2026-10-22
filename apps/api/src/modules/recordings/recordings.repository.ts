import type { Knex } from "knex";
import type { CreateRecordingInput, Notes, Recording, Segment } from "@vn/shared";
import { db } from "../../db.js";
import { httpError } from "../../lib/http-error.js";

export type RecordingRow = {
  id: string;
  user_id: string;
  title: string;
  mode: Recording["mode"];
  language: Recording["language"];
  status: Recording["status"];
  source: string;
  mime_type: string;
  chunk_count: number;
  duration_ms: number | null;
  audio_key: string | null;
  error: string | null;
  share_token: string | null;                 // Task 1.30: the read-only link, or null
  created_at: Date;
  updated_at: Date;
};

type SegmentRow = { recording_id: string; start_ms: number; end_ms: number; speaker: string | null; text: string };
type NotesRow = { recording_id: string; version: number; content: Notes; edited_by_user: boolean };

/** Row → the API shape from @vn/shared (camelCase, no internal columns). */
export const toRecording = (r: RecordingRow): Recording => ({
  id: r.id,
  title: r.title,
  mode: r.mode,
  language: r.language,
  status: r.status,
  durationMs: r.duration_ms,
  error: r.error,
  createdAt: r.created_at.toISOString(),
});

export class RecordingsRepository {
  constructor(private db: Knex) {}

  async create(userId: string, input: CreateRecordingInput) {
    const [row] = await this.db<RecordingRow>("recordings")
      .insert({
        user_id: userId,
        mode: input.mode,
        language: input.language,
        source: input.source,
        mime_type: input.mimeType,
        ...(input.title ? { title: input.title } : {}),
      })
      .returning("*");
    return row!;
  }

  getById(id: string) {
    return this.db<RecordingRow>("recordings").where({ id }).first();
  }

  /** Someone else's recording looks exactly like a missing one: 404, never 403. */
  async getOwned(userId: string, id: string) {
    const row = await this.db<RecordingRow>("recordings").where({ id, user_id: userId }).first();
    if (!row) throw httpError(404, "Recording not found");
    return row;
  }

  /** A ready recording shared with this token, or undefined (unknown token, link turned off, not ready). */
  getShared(token: string) {
    return this.db<RecordingRow>("recordings").where({ share_token: token, status: "ready" }).first();
  }

  listByUser(userId: string) {
    return this.db<RecordingRow>("recordings").where({ user_id: userId }).orderBy("created_at", "desc");
  }

  update(id: string, patch: Partial<Omit<RecordingRow, "id" | "user_id" | "created_at">>) {
    return this.db<RecordingRow>("recordings")
      .where({ id })
      .update({ ...patch, updated_at: this.db.fn.now() as unknown as Date });
  }

  async getSegments(recordingId: string): Promise<Segment[]> {
    const rows = await this.db<SegmentRow>("transcript_segments")
      .where({ recording_id: recordingId })
      .orderBy("start_ms")
      .select("start_ms", "end_ms", "speaker", "text");
    return rows.map((s) => ({ startMs: s.start_ms, endMs: s.end_ms, speaker: s.speaker, text: s.text }));
  }

  /** Delete + insert in one transaction, so a retried transcribe job never leaves duplicates. */
  replaceSegments(recordingId: string, segments: Segment[]) {
    return this.db.transaction(async (trx) => {
      await trx("transcript_segments").where({ recording_id: recordingId }).delete();
      if (segments.length) {
        await trx("transcript_segments").insert(
          segments.map((s) => ({ recording_id: recordingId, start_ms: s.startMs, end_ms: s.endMs, speaker: s.speaker, text: s.text })),
        );
      }
    });
  }

  /** Total recorded time of this user's recordings created this calendar month (database time zone). */
  async durationThisMonth(userId: string) {
    const row = await this.db("recordings")
      .where({ user_id: userId })
      .where("created_at", ">=", this.db.raw("date_trunc('month', now())"))
      .sum<{ ms: string | null }>("duration_ms as ms")
      .first();
    return Number(row?.ms ?? 0);
  }

  async countSegments(recordingId: string) {
    const row = await this.db("transcript_segments").where({ recording_id: recordingId }).count<{ n: string }>("id as n").first();
    return Number(row?.n ?? 0);
  }

  latestNotes(recordingId: string) {
    return this.db<NotesRow>("notes")
      .where({ recording_id: recordingId })
      .orderBy("version", "desc")
      .first("version", "content", "edited_by_user");
  }

  /** Notes are never overwritten: every save is a new version. */
  saveNotesVersion(recordingId: string, content: Notes, editedByUser: boolean) {
    return this.db.transaction(async (trx) => {
      const last = await trx("notes").where({ recording_id: recordingId }).max<{ v: number | null }>("version as v").first();
      const version = (last?.v ?? 0) + 1;
      await trx("notes").insert({
        recording_id: recordingId,
        version,
        content: JSON.stringify(content),
        edited_by_user: editedByUser,
      });
      return version;
    });
  }

  /** AI notes (not user-edited) as the next version. */
  insertNotes(recordingId: string, content: Notes) {
    return this.saveNotesVersion(recordingId, content, false);
  }

  /** Delete + insert, so a retried notes job never leaves duplicates. */
  async replaceActionItems(recordingId: string, userId: string, items: (Notes["actionItems"][number] & { done?: boolean })[]) {
    await this.db("action_items").where({ recording_id: recordingId }).delete();
    if (items.length) {
      await this.db("action_items").insert(
        items.map((a) => ({ recording_id: recordingId, user_id: userId, text: a.text, owner: a.owner, due_date: a.dueDate, done: a.done ?? false })),
      );
    }
  }

  /** Runs `fn` with a repository bound to one transaction: all its writes commit together or not at all. */
  transaction<T>(fn: (trx: RecordingsRepository) => Promise<T>) {
    return this.db.transaction((trx) => fn(new RecordingsRepository(trx)));
  }

  /** Segments, notes and action items go with it (on delete cascade). */
  delete(id: string) {
    return this.db("recordings").where({ id }).delete();
  }
}

export const repo = new RecordingsRepository(db);
