import { randomBytes } from "node:crypto";
import { SavedNotes, type CreateRecordingInput, type RecordingMode, type SharedRecording } from "@vn/shared";
import { config } from "../../config.js";
import { httpError } from "../../lib/http-error.js";
import { keys, storage } from "../../storage/storage.service.js";
import { type RecordingRow, type RecordingsRepository, toRecording } from "./recordings.repository.js";

const PROCESSING: RecordingRow["status"][] = ["uploaded", "transcribing", "summarizing"];

/** The part of a BullMQ Queue the service uses, so tests can pass a fake. */
export type JobQueue = {
  add(name: string, data: { recordingId: string }, opts: { jobId: string }): Promise<unknown>;
  getJob(jobId: string): Promise<{ remove(): Promise<unknown> } | undefined | null>;
};
export type Queues = { transcribe: JobQueue; notes: JobQueue; embed?: JobQueue };   // embed: Task 2.1 (tests may leave it out)

export class RecordingsService {
  constructor(private repo: RecordingsRepository, private queues: Queues) {}

  create(userId: string, input: CreateRecordingInput) {
    return this.repo.create(userId, input);
  }

  async saveChunk(userId: string, id: string, index: number, body: Buffer) {
    const rec = await this.repo.getOwned(userId, id);
    if (rec.status !== "recording") throw httpError(409, "Recording is already finished");
    await storage.put(keys.chunk(id, index), body, rec.mime_type);
  }

  async finish(userId: string, id: string, body: { chunkCount: number; durationMs: number }) {
    const rec = await this.repo.getOwned(userId, id);               // throws 404 if not owner
    if (rec.status !== "recording") throw httpError(409, "Already finished");
    await this.checkMonthlyLimit(userId, body.durationMs);          // cost guard
    await this.repo.update(id, { status: "uploaded", chunk_count: body.chunkCount, duration_ms: body.durationMs });
    await this.queues.transcribe.add("transcribe", { recordingId: id }, { jobId: `transcribe-${id}` });
  }

  async list(userId: string) {
    return (await this.repo.listByUser(userId)).map(toRecording);
  }

  async get(userId: string, id: string) {
    const rec = await this.repo.getOwned(userId, id);
    const [segments, notes] = await Promise.all([this.repo.getSegments(id), this.repo.latestNotes(id)]);
    return {
      recording: toRecording(rec),
      segments,
      notes: notes ? { version: notes.version, editedByUser: notes.edited_by_user, content: notes.content } : null,
      shareToken: rec.share_token,                    // only the owner sees this (getOwned above)
    };
  }

  /** Creates the read-only link (or returns the one that is already on). Only recordings with notes. */
  async share(userId: string, id: string) {
    const rec = await this.repo.getOwned(userId, id);
    if (rec.status !== "ready") throw httpError(409, "Only a recording with notes can be shared");
    if (rec.share_token) return { token: rec.share_token };
    const token = randomBytes(32).toString("base64url");          // 256 bits: can't be guessed
    await this.repo.update(id, { share_token: token });
    return { token };
  }

  /** Turns the link off at once; a new link later gets a new token. */
  async unshare(userId: string, id: string) {
    await this.repo.getOwned(userId, id);
    await this.repo.update(id, { share_token: null });
  }

  /** The public view: the notes only. Unknown, turned-off or not-ready links all look the same: 404. */
  async shared(token: string): Promise<SharedRecording> {
    const rec = await this.repo.getShared(token);
    const notes = rec && (await this.repo.latestNotes(rec.id));
    if (!rec || !notes) throw httpError(404, "Link not found");
    const r = toRecording(rec);
    return { title: r.title, mode: r.mode, language: r.language, createdAt: r.createdAt, durationMs: r.durationMs, notes: SavedNotes.parse(notes.content) };
  }

  async audioUrl(userId: string, id: string) {
    const rec = await this.repo.getOwned(userId, id);
    if (!rec.audio_key) throw httpError(404, "Audio is not ready yet");
    return storage.signedUrl(rec.audio_key);
  }

  /** A person's edit: a new notes version, and action_items follow it (like the notes job does). */
  async saveNotes(userId: string, id: string, content: SavedNotes) {
    await this.repo.getOwned(userId, id);
    return this.repo.transaction(async (trx) => {
      const version = await trx.saveNotesVersion(id, content, true);
      await trx.replaceActionItems(id, userId, content.actionItems);
      return version;
    });
  }

  /** Task 1.38: fix a misheard line. Search follows at once (the generated `tsv` column). */
  async editSegment(userId: string, id: string, segmentId: string, text: string) {
    await this.repo.getOwned(userId, id);
    if (!(await this.repo.editSegment(id, segmentId, text))) throw httpError(404, "Line not found");
    await this.queues.embed?.add("embed", { recordingId: id }, { jobId: `embed-${id}-${Date.now()}` });   // its meaning changed (Task 2.1)
  }

  /** Task 1.38: new AI notes from the transcript as it is now, optionally as another mode. The old versions stay. */
  async regenerate(userId: string, id: string, mode: RecordingMode) {
    const rec = await this.repo.getOwned(userId, id);
    if (PROCESSING.includes(rec.status)) throw httpError(409, "The recording is still being processed");
    if ((await this.repo.countSegments(id)) === 0) throw httpError(409, "There is no transcript to make notes from");
    const jobId = `notes-${id}`;
    await (await this.queues.notes.getJob(jobId))?.remove();       // BullMQ ignores add() with a finished job's id
    await this.repo.update(id, { mode, status: "summarizing", error: null });
    await this.queues.notes.add("notes", { recordingId: id }, { jobId });
  }

  /** Runs the pipeline again from the step that failed: no transcript yet → transcribe, otherwise → notes. */
  async retry(userId: string, id: string) {
    const rec = await this.repo.getOwned(userId, id);
    if (rec.status !== "failed") throw httpError(409, "Only a failed recording can be retried");
    const [queue, name, status] = (await this.repo.countSegments(id)) === 0
      ? [this.queues.transcribe, "transcribe", "uploaded"] as const
      : [this.queues.notes, "notes", "summarizing"] as const;
    const jobId = `${name}-${id}`;
    // BullMQ keeps finished and failed jobs and silently ignores add() with an existing id,
    // so without this the retry would do nothing
    await (await queue.getJob(jobId))?.remove();
    await this.repo.update(id, { status, error: null });
    await queue.add(name, { recordingId: id }, { jobId });
  }

  async delete(userId: string, id: string) {
    await this.repo.getOwned(userId, id);
    await storage.deletePrefix(keys.prefix(id));                    // audio first: a failed delete leaves the row to retry from
    await this.repo.delete(id);
  }

  /** Cost guard: the minutes recorded this month, plus this one, must stay within MONTHLY_MINUTES_LIMIT. */
  private async checkMonthlyLimit(userId: string, durationMs: number) {
    const usedMs = await this.repo.durationThisMonth(userId);
    const limitMs = config.MONTHLY_MINUTES_LIMIT * 60_000;
    if (usedMs + durationMs > limitMs) {
      const used = Math.round(usedMs / 60_000);
      throw httpError(402, `This recording would go over your ${config.MONTHLY_MINUTES_LIMIT} minutes for this month (${used} used). It can be processed next month, or delete older recordings you no longer need.`);
    }
  }
}
