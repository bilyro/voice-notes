// Try notes generation: pnpm --filter @vn/api tsx scripts/try-notes.ts <file> [meeting|lesson|memo]
//   <file>.txt → a transcript, one segment per line (timestamps estimated at 150 words/min)
//   any other  → an audio file, transcribed first with the configured STT provider
import { readFile } from "node:fs/promises";
import { RecordingMode, type Segment } from "@vn/shared";
import { notesGenerator, stt } from "../src/ai/providers.js";
import { formatTranscript } from "../src/ai/notes/notes-generator.js";

const [file, modeArg = "meeting"] = process.argv.slice(2);
if (!file) throw new Error("Usage: tsx scripts/try-notes.ts <file> [meeting|lesson|memo]");
const mode = RecordingMode.parse(modeArg);

async function fromText(path: string): Promise<Segment[]> {
  let ms = 0;
  return (await readFile(path, "utf8")).split("\n").filter((l) => l.trim()).map((text) => {
    const startMs = ms;
    ms += Math.round((text.split(/\s+/).length / 150) * 60_000);
    return { startMs, endMs: ms, speaker: null, text: text.trim() };
  });
}

const segments = file.endsWith(".txt") ? await fromText(file) : (await stt.transcribe(file, { language: "en", diarize: false })).segments;
const chars = formatTranscript(segments).length;
const minutes = Math.round((segments.at(-1)?.endMs ?? 0) / 60_000);
console.error(`${notesGenerator.name}: ${segments.length} segments, ~${minutes} min, ${chars} chars, mode=${mode}`);

const started = Date.now();
const notes = await notesGenerator.generate(segments, mode);   // throws if the JSON doesn't match the Notes schema
console.log(JSON.stringify(notes, null, 2));
console.error(`valid Notes in ${Math.round((Date.now() - started) / 1000)} s`);
