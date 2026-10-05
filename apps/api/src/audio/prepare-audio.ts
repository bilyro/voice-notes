import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";
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

  // one write stream for all chunks, in order. (pipeline(..., { end: false }) per chunk left listeners
  // on the file each time: MaxListenersExceededWarning from 10 chunks on, hundreds for a long recording)
  const file = createWriteStream(raw);
  const done = finished(file);
  done.catch(() => {});                        // a write error also rejects `done`, awaited below
  for (let i = 0; i < chunkCount; i++) {
    for await (const part of await storage.getStream(keys.chunk(recordingId, i))) {
      if (!file.write(part)) await once(file, "drain");
    }
  }
  file.end();
  await done;

  await ffmpeg(["-i", raw, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", out]);
  await storage.put(keys.audio(recordingId), await readFile(out), "audio/ogg");
  return { localPath: out, dir };
}
