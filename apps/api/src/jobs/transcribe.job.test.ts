import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../db.js";
import { repo } from "../modules/recordings/recordings.repository.js";
import { connection, queues } from "../queue/queues.js";
import { keys, storage } from "../storage/storage.service.js";
import { transcribeJob } from "./transcribe.job.js";

// the real providers throw without AI keys (CI has none); Task 1.8 adds notesGenerator: FakeNotes here
vi.mock("../ai/providers.js", async () => ({
  stt: new (await import("../ai/stt/fake-stt.js")).FakeStt(),
}));

// integration test: needs Postgres, Redis, S3 (docker compose up -d) and ffmpeg
const ids: string[] = [];

/** A 2 s 440 Hz tone as WebM/Opus, like one browser chunk. Synthetic, so no real recording is involved. */
const toneChunk = () =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:a", "libopus", "-f", "webm", "pipe:1"]);

afterAll(async () => {
  for (const id of ids) {
    await (await queues.notes.getJob(`notes-${id}`))?.remove();
    await storage.deletePrefix(keys.prefix(id));
    await repo.delete(id);
  }
  await Promise.all([queues.transcribe.close(), queues.notes.close()]);
  await connection.quit();
  await db.destroy();
});

describe("transcribeJob", () => {
  it("saves the segments, stores the audio and queues the notes job; a retry adds no duplicates", async () => {
    const rec = await repo.create(`test-${randomUUID()}`, { mode: "lesson", language: "en", mimeType: "audio/webm", source: "web" });
    ids.push(rec.id);
    await storage.put(keys.chunk(rec.id, 0), toneChunk(), "audio/webm");
    await repo.update(rec.id, { status: "uploaded", chunk_count: 1, duration_ms: 2000 });

    await transcribeJob(rec.id);
    await transcribeJob(rec.id);                             // BullMQ retries re-run the whole job

    const segments = await repo.getSegments(rec.id);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toEqual({ startMs: 4000, endMs: 9000, speaker: null, text: "Olena will prepare the quiz by Friday." });

    const after = await repo.getById(rec.id);
    expect(after).toMatchObject({ status: "transcribing", error: null, audio_key: keys.audio(rec.id) });
    await expect(storage.getStream(keys.audio(rec.id))).resolves.toBeDefined();

    const job = await queues.notes.getJob(`notes-${rec.id}`);
    expect(job?.data).toEqual({ recordingId: rec.id });
  });
});
