import { rm } from "node:fs/promises";
import { prepareAudio } from "../audio/prepare-audio.js";
import { stt } from "../ai/providers.js";
import { repo } from "../modules/recordings/recordings.repository.js";
import { queues } from "../queue/queues.js";
import { keys } from "../storage/storage.service.js";

export async function transcribeJob(recordingId: string) {
  const rec = await repo.getById(recordingId);
  if (!rec) return;                                          // deleted while the job waited: nothing to do
  await repo.update(recordingId, { status: "transcribing", error: null });

  const { localPath, dir } = await prepareAudio(recordingId, rec.chunk_count);
  try {
    const { segments } = await stt.transcribe(localPath, { language: rec.language, diarize: false });
    await repo.replaceSegments(recordingId, segments);       // delete + insert in one transaction
    await repo.update(recordingId, { audio_key: keys.audio(recordingId) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await queues.notes.add("notes", { recordingId }, { jobId: `notes-${recordingId}` });
}
