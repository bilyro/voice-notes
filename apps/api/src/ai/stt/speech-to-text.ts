import type { LanguageCode, Segment } from "@vn/shared";

export interface TranscribeOptions {
  language: LanguageCode;            // en | uk | es, forced (Task 1.26)
  diarize: boolean;
}

export interface SpeechToText {
  readonly name: string;
  transcribe(localPath: string, opts: TranscribeOptions): Promise<{ segments: Segment[]; language?: string }>;
}
