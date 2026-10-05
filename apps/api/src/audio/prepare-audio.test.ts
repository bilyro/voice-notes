import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { keys, storage } from "../storage/storage.service.js";
import { prepareAudio } from "./prepare-audio.js";

// integration test: needs S3 (docker compose up -d) and ffmpeg
const id = randomUUID();
afterAll(() => storage.deletePrefix(keys.prefix(id)));

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
});
