import { rm } from "node:fs/promises";
import { prepareAudio } from "../audio/prepare-audio.js";
import { stt } from "../ai/providers.js";
import { onlySilencePhrases } from "../ai/stt/silence-phrases.js";
import { repo } from "../modules/recordings/recordings.repository.js";
import { queues } from "../queue/queues.js";
import { keys } from "../storage/storage.service.js";

export async function transcribeJob(recordingId: string) {
  const rec = await repo.getById(recordingId);
  if (!rec) return;                                          // deleted while the job waited: nothing to do
  await repo.update(recordingId, { status: "transcribing", error: null });

  const { localPath, dir } = await prepareAudio(recordingId, rec.chunk_count);
  try {
    const prompt = rec.vocabulary ?? undefined;
    const { segments } = await stt.transcribe(localPath, { language: rec.language, diarize: false, prompt });
    // only "Thank you." and the like (or the hint echoed back) means silence: no transcript, so the notes job reports "No speech detected"
    await repo.replaceSegments(recordingId, onlySilencePhrases(segments, prompt) ? [] : segments);   // delete + insert in one transaction
    await repo.update(recordingId, { audio_key: keys.audio(recordingId) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await queues.notes.add("notes", { recordingId }, { jobId: `notes-${recordingId}` });
  // Task 2.1: meaning vectors, in parallel with the notes. The job only fills empty lines, so a fresh id each time is
  // safe (a reused id would be ignored by BullMQ while the finished job is kept)
  await queues.embed.add("embed", { recordingId }, { jobId: `embed-${recordingId}-${Date.now()}` });
}
