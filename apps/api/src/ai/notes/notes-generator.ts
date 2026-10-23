import type { LanguageCode, Notes, RecordingMode, Segment } from "@vn/shared";

export interface NotesGenerator {
  readonly name: string;
  /** `language` is the language of the recording (the notes are written in it); `vocabulary` how names are spelled */
  generate(segments: Segment[], mode: RecordingMode, language: LanguageCode, vocabulary?: string | null): Promise<Notes>;
}

/** "[12:05] Speaker 1: text" — timestamps help the model and let us link back later */
export function formatTranscript(segments: Segment[]) {
  return segments.map((s) => {
    const t = new Date(s.startMs).toISOString().slice(11, 19);
    return `[${t}]${s.speaker ? ` ${s.speaker}:` : ""} ${s.text}`;
  }).join("\n");
}
