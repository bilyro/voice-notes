import type { CreateRecordingInput, Notes } from "@vn/shared";
import { httpError } from "../../lib/http-error.js";
import { keys, storage } from "../../storage/storage.service.js";
import { type RecordingsRepository, toRecording } from "./recordings.repository.js";

/** The part of a BullMQ Queue the service uses, so tests can pass a fake. Real queues arrive in Task 1.3. */
export type JobQueue = {
  add(name: string, data: { recordingId: string }, opts: { jobId: string }): Promise<unknown>;
};
export type Queues = { transcribe: JobQueue; notes: JobQueue };

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
    };
  }

  async audioUrl(userId: string, id: string) {
    const rec = await this.repo.getOwned(userId, id);
    if (!rec.audio_key) throw httpError(404, "Audio is not ready yet");
    return storage.signedUrl(rec.audio_key);
  }

  async saveNotes(userId: string, id: string, content: Notes) {
    await this.repo.getOwned(userId, id);
    return this.repo.saveNotesVersion(id, content, true);
  }

  // basic version; Task 1.15 removes the old failed job first, otherwise BullMQ ignores add() with the same id
  async retry(userId: string, id: string) {
    const rec = await this.repo.getOwned(userId, id);
    if (rec.status !== "failed") throw httpError(409, "Only a failed recording can be retried");
    if ((await this.repo.countSegments(id)) === 0) {
      await this.repo.update(id, { status: "uploaded", error: null });
      await this.queues.transcribe.add("transcribe", { recordingId: id }, { jobId: `transcribe-${id}` });
    } else {
      await this.repo.update(id, { status: "summarizing", error: null });
      await this.queues.notes.add("notes", { recordingId: id }, { jobId: `notes-${id}` });
    }
  }

  async delete(userId: string, id: string) {
    await this.repo.getOwned(userId, id);
    await storage.deletePrefix(keys.prefix(id));                    // audio first: a failed delete leaves the row to retry from
    await this.repo.delete(id);
  }

  // stub; Task 1.15 sums this month's duration_ms and rejects with 402 over MONTHLY_MINUTES_LIMIT
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the 1.15 version uses both
  private async checkMonthlyLimit(_userId: string, _durationMs: number) {}
}
