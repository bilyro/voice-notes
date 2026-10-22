import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { keys, storage } from "../storage/storage.service.js";
import { prepareAudio } from "./prepare-audio.js";

// integration test: needs S3 (docker compose up -d) and ffmpeg
const id = randomUUID();
const videoId = randomUUID();
afterAll(async () => {
  await storage.deletePrefix(keys.prefix(id));
  await storage.deletePrefix(keys.prefix(videoId));
});

describe("prepareAudio", () => {
  it("joins many chunks in order into one mono 16 kHz Opus file, without piling up listeners", async () => {
    // a 20 s tone cut into 15 byte chunks, the way MediaRecorder slices one stream
    const webm = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
      "-c:a", "libopus", "-f", "webm", "pipe:1"]);
    const size = Math.ceil(webm.length / 15);
    for (let i = 0; i < 15; i++) await storage.put(keys.chunk(id, i), webm.subarray(i * size, (i + 1) * size), "audio/webm");

    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.name);
    process.on("warning", onWarning);
    const { localPath, dir } = await prepareAudio(id, 15);
    await new Promise((r) => setTimeout(r, 50));             // warnings are emitted on the next tick
    process.off("warning", onWarning);

    expect(warnings).not.toContain("MaxListenersExceededWarning");
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,channels:format=duration", "-of", "json", localPath]).toString();
    const info = JSON.parse(probe) as { streams: { codec_name: string; channels: number }[]; format: { duration: string } };
    expect(info.streams[0]).toMatchObject({ codec_name: "opus", channels: 1 });
    expect(Number(info.format.duration)).toBeCloseTo(20, 0);
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps only the sound of an uploaded video (a Zoom .mp4)", async () => {
    const mp4 = join(await mkdtemp(join(tmpdir(), "video-")), "meeting.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=5", "-f", "lavfi", "-i", "sine=frequency=440",
      "-t", "6", "-c:v", "libx264", "-c:a", "aac", mp4]);
    const bytes = await readFile(mp4);
    const half = Math.ceil(bytes.length / 2);
    await storage.put(keys.chunk(videoId, 0), bytes.subarray(0, half), "video/mp4");
    await storage.put(keys.chunk(videoId, 1), bytes.subarray(half), "video/mp4");

    const { localPath, dir } = await prepareAudio(videoId, 2);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", localPath]).toString();
    const { streams } = JSON.parse(probe) as { streams: { codec_type: string; codec_name: string }[] };
    expect(streams).toEqual([{ codec_type: "audio", codec_name: "opus" }]);
    await rm(dir, { recursive: true, force: true });
    await rm(dirname(mp4), { recursive: true, force: true });
  });
});
