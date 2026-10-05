import type { Notes, RecordingMode, Segment } from "@vn/shared";

export interface NotesGenerator {
  readonly name: string;
  generate(segments: Segment[], mode: RecordingMode): Promise<Notes>;
}

/** "[12:05] Speaker 1: text" — timestamps help the model and let us link back later */
export function formatTranscript(segments: Segment[]) {
  return segments.map((s) => {
    const t = new Date(s.startMs).toISOString().slice(11, 19);
    return `[${t}]${s.speaker ? ` ${s.speaker}:` : ""} ${s.text}`;
  }).join("\n");
}
