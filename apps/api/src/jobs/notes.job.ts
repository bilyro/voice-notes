import { notesGenerator } from "../ai/providers.js";
import { repo } from "../modules/recordings/recordings.repository.js";

export async function notesJob(recordingId: string) {
  const rec = await repo.getById(recordingId);
  if (!rec) return;                                          // deleted while the job waited: nothing to do
  await repo.update(recordingId, { status: "summarizing" });

  const segments = await repo.getSegments(recordingId);
  if (segments.length === 0) {
    return repo.update(recordingId, { status: "failed", error: "No speech detected" });
  }

  const notes = await notesGenerator.generate(segments, rec.mode, rec.language, rec.vocabulary);

  await repo.transaction(async (trx) => {
    await trx.insertNotes(recordingId, notes);                       // version = last + 1
    await trx.replaceActionItems(recordingId, rec.user_id, notes.actionItems);
    await trx.update(recordingId, {
      status: "ready",
      title: rec.title === "Untitled recording" ? notes.title : rec.title,
    });
  });
}
