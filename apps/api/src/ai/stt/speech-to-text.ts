import type { LanguageCode, Segment } from "@vn/shared";

export interface TranscribeOptions {
  language: LanguageCode;            // "en" only for now (Task 1.0)
  diarize: boolean;
}

export interface SpeechToText {
  readonly name: string;
  transcribe(localPath: string, opts: TranscribeOptions): Promise<{ segments: Segment[]; language?: string }>;
}
