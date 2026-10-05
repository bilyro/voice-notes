import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { storage, keys } from "../storage/storage.service.js";

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);                     // e.g. ffmpeg not installed: fail the job instead of crashing the worker
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err}`))));
  });
}

/** Returns the local path of the normalized file and uploads it to storage. */
export async function prepareAudio(recordingId: string, chunkCount: number) {
  const dir = await mkdtemp(join(tmpdir(), `rec-${recordingId}-`));
  const raw = join(dir, "raw");
  const out = join(dir, "audio.ogg");

  const file = createWriteStream(raw);
  for (let i = 0; i < chunkCount; i++) {
    await pipeline(await storage.getStream(keys.chunk(recordingId, i)), file, { end: false });
  }
  file.end();
  await new Promise((r) => file.on("finish", r));

  await ffmpeg(["-i", raw, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", out]);
  await storage.put(keys.audio(recordingId), await readFile(out), "audio/ogg");
  return { localPath: out, dir };
}
