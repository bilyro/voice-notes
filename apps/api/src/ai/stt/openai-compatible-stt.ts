// Groq's API is OpenAI-compatible, so ONE class serves the free and the paid provider.
import fs from "node:fs";
import type OpenAI from "openai";
import type { SpeechToText, TranscribeOptions } from "./speech-to-text.js";

export class OpenAiCompatibleStt implements SpeechToText {
  constructor(
    readonly name: string,
    private client: OpenAI,
    private model: string,   // "whisper-large-v3-turbo" (Groq, free) | "whisper-1" (OpenAI, paid)
  ) {}

  async transcribe(localPath: string, opts: TranscribeOptions) {
    const res = await this.client.audio.transcriptions.create({
      file: fs.createReadStream(localPath),
      model: this.model,
      response_format: "verbose_json",         // segment timestamps, needed for click-to-seek
      timestamp_granularities: ["segment"],
      language: opts.language,                 // forcing the language beats auto-detect on accuracy
    });
    const segments = (res.segments ?? []).map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      speaker: null,                         // no diarization yet
      text: s.text.trim(),
    }));
    return { segments, language: res.language };
  }
}
