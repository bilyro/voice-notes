import { embedder } from "../ai/embeddings/index.js";
import { toPgVector } from "../ai/embeddings/embedder.js";
import { db } from "../db.js";

const BATCH = 32;

/**
 * Task 2.1: fills the embedding of every line of a recording that has none yet. Idempotent: a retry, a second job
 * or a run after a line edit only does the lines still missing. A deleted recording has no lines: nothing to do.
 */
export async function embedJob(recordingId: string) {
  const lines = await db("transcript_segments").where({ recording_id: recordingId }).whereNull("embedding")
    .orderBy("start_ms").select<{ id: string; text: string }[]>("id", "text");
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH);
    const vectors = await embedder.embedPassages(batch.map((l) => l.text));
    await db.transaction(async (trx) => {
      for (const [j, line] of batch.entries()) {
        await trx("transcript_segments").where({ id: line.id }).update({ embedding: toPgVector(vectors[j]!) });
      }
    });
  }
  return lines.length;
}
