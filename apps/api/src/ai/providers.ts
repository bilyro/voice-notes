// the ONLY place that picks adapters
import OpenAI from "openai";
import { config, GROQ_BASE_URL } from "../config.js";
import { OpenAiCompatibleStt } from "./stt/openai-compatible-stt.js";
import type { SpeechToText } from "./stt/speech-to-text.js";

// Only the worker imports this file: fail fast there if a selected provider has no API key.
const keyFor = { groq: "GROQ_API_KEY", openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY" } as const;
for (const provider of new Set([config.STT_PROVIDER, config.NOTES_PROVIDER])) {
  if (!config[keyFor[provider]]) throw new Error(`${keyFor[provider]} is required because a provider is set to "${provider}"`);
}

export const stt: SpeechToText =
  config.STT_PROVIDER === "openai"
    ? new OpenAiCompatibleStt("openai-whisper-1", new OpenAI({ apiKey: config.OPENAI_API_KEY }), "whisper-1")
    : new OpenAiCompatibleStt("groq-whisper-large-v3-turbo",
        new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: GROQ_BASE_URL }), "whisper-large-v3-turbo");

// Task 1.8 adds `notesGenerator` here (GroqNotes / ClaudeNotes, picked by NOTES_PROVIDER)

// Phase 6: add WhisperCppStt / OllamaNotes here
