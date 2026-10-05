// Try speech-to-text on a local file: pnpm --filter @vn/api tsx scripts/try-stt.ts <audio file>
// Builds the adapter from STT_PROVIDER here; Task 1.6 moves that choice into src/ai/providers.ts.
import OpenAI from "openai";
import { config, GROQ_BASE_URL } from "../src/config.js";
import { OpenAiCompatibleStt } from "../src/ai/stt/openai-compatible-stt.js";

const file = process.argv[2];
if (!file) throw new Error("Usage: tsx scripts/try-stt.ts <audio file>");

const stt =
  config.STT_PROVIDER === "groq"
    ? new OpenAiCompatibleStt("groq", new OpenAI({ apiKey: required("GROQ_API_KEY"), baseURL: GROQ_BASE_URL }), "whisper-large-v3-turbo")
    : new OpenAiCompatibleStt("openai", new OpenAI({ apiKey: required("OPENAI_API_KEY") }), "whisper-1");

function required(name: "GROQ_API_KEY" | "OPENAI_API_KEY") {
  const value = config[name];
  if (!value) throw new Error(`${name} is not set in .env (STT_PROVIDER=${config.STT_PROVIDER})`);
  return value;
}

const started = Date.now();
const { segments, language } = await stt.transcribe(file, { language: "en", diarize: false });
const time = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
for (const s of segments) console.log(`[${time(s.startMs)}–${time(s.endMs)}] ${s.text}`);
console.log(`\n${stt.name}: ${segments.length} segments, language=${language ?? "?"}, ${Date.now() - started} ms`);
