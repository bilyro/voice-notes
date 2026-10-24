import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { connection, queues } from "../../queue/queues.js";
import { keys, storage } from "../../storage/storage.service.js";
import { repo } from "./recordings.repository.js";
import { RecordingsService } from "./recordings.service.js";

// integration test with the REAL queues (Redis), because the bug is BullMQ's: add() with an id that
// already exists is ignored. Nothing processes these jobs; the test only looks at them.
const service = new RecordingsService(repo, queues);
const ids: string[] = [];
const userId = `test-${randomUUID()}`;

async function newRecording(patch: Parameters<typeof repo.update>[1] = {}, user = userId) {
  const rec = await repo.create(user, { mode: "meeting", language: "en", mimeType: "audio/webm", source: "web" });
  ids.push(rec.id);
  if (Object.keys(patch).length) await repo.update(rec.id, patch);
  return rec.id;
}

afterAll(async () => {
  for (const id of ids) {
    for (const [q, name] of [[queues.transcribe, "transcribe"], [queues.notes, "notes"]] as const) await (await q.getJob(`${name}-${id}`))?.remove();
    await storage.deletePrefix(keys.prefix(id));
  }
  await db("recordings").whereIn("id", ids).delete();
  await Promise.all([queues.transcribe.close(), queues.notes.close(), queues.embed.close()]);
  await connection.quit();
  await db.destroy();
});

describe("retry", () => {
  it("replaces the old transcribe job when there is no transcript yet", async () => {
    const id = await newRecording({ status: "failed", error: "401 Invalid API Key" });
    await queues.transcribe.add("transcribe", { recordingId: id }, { jobId: `transcribe-${id}` });   // stands in for the job that failed
    const old = (await queues.transcribe.getJob(`transcribe-${id}`))!.timestamp;
    await new Promise((r) => setTimeout(r, 5));

    await service.retry(userId, id);

    // read back from Redis: add() returns a fresh local object even when Redis ignored it
    expect((await queues.transcribe.getJob(`transcribe-${id}`))!.timestamp).toBeGreaterThan(old);
    expect(await repo.getById(id)).toMatchObject({ status: "uploaded", error: null });
  });

  it("would be ignored by BullMQ without removing the old job first (the bug it fixes)", async () => {
    const id = await newRecording();
    await queues.transcribe.add("transcribe", { recordingId: id }, { jobId: `transcribe-${id}` });
    const stored = (await queues.transcribe.getJob(`transcribe-${id}`))!.timestamp;
    await new Promise((r) => setTimeout(r, 5));
    await queues.transcribe.add("transcribe", { recordingId: id }, { jobId: `transcribe-${id}` });
    expect((await queues.transcribe.getJob(`transcribe-${id}`))!.timestamp).toBe(stored);   // Redis kept the old job
  });

  it("queues only the notes job when the transcript already exists", async () => {
    const id = await newRecording({ status: "failed", error: "Notes were cut off (length)" });
    await repo.replaceSegments(id, [{ startMs: 0, endMs: 1000, speaker: null, text: "Hello." }]);
    await queues.notes.add("notes", { recordingId: id }, { jobId: `notes-${id}` });

    await service.retry(userId, id);

    expect(await queues.notes.getJob(`notes-${id}`)).toBeTruthy();
    expect(await queues.transcribe.getJob(`transcribe-${id}`)).toBeFalsy();
    expect(await repo.getById(id)).toMatchObject({ status: "summarizing", error: null });
  });

  it("refuses recordings that did not fail", async () => {
    const id = await newRecording({ status: "ready" });
    await expect(service.retry(userId, id)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("monthly minutes limit", () => {
  it("rejects finish with 402 when the month would go over the limit", async () => {
    const user = `test-${randomUUID()}`;
    const limitMs = config.MONTHLY_MINUTES_LIMIT * 60_000;
    await newRecording({ status: "ready", duration_ms: limitMs - 10 * 60_000 }, user);      // 10 min left this month
    const old = await newRecording({ status: "ready", duration_ms: 500 * 60_000 }, user);
    await db("recordings").where({ id: old }).update({ created_at: db.raw("date_trunc('month', now()) - interval '1 day'") });   // last month: not counted

    const tooLong = await newRecording({}, user);
    await expect(service.finish(user, tooLong, { chunkCount: 1, durationMs: 11 * 60_000 }))
      .rejects.toMatchObject({ statusCode: 402, message: expect.stringContaining(`${config.MONTHLY_MINUTES_LIMIT} minutes`) });
    expect(await repo.getById(tooLong)).toMatchObject({ status: "recording" });             // nothing was queued

    const fits = await newRecording({}, user);
    await service.finish(user, fits, { chunkCount: 1, durationMs: 9 * 60_000 });
    expect(await repo.getById(fits)).toMatchObject({ status: "uploaded" });
  });
});

describe("delete", () => {
  it("removes every object under the recording's prefix and the rows", async () => {
    const id = await newRecording({ status: "ready", audio_key: "" });
    await storage.put(keys.chunk(id, 0), Buffer.from("a"), "audio/webm");
    await storage.put(keys.chunk(id, 1), Buffer.from("b"), "audio/webm");
    await storage.put(keys.audio(id), Buffer.from("c"), "audio/ogg");
    await repo.replaceSegments(id, [{ startMs: 0, endMs: 1000, speaker: null, text: "Hello." }]);

    await service.delete(userId, id);

    for (const key of [keys.chunk(id, 0), keys.chunk(id, 1), keys.audio(id)]) await expect(storage.getStream(key)).rejects.toThrow();
    expect(await repo.getById(id)).toBeUndefined();
    expect(await db("transcript_segments").where({ recording_id: id }).count<{ n: string }>("id as n").first()).toEqual({ n: "0" });
  });
});
