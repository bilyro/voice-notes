// map → reduce shared by all adapters
import type { Notes, RecordingMode, Segment } from "@vn/shared";
import { formatTranscript, type NotesGenerator } from "./notes-generator.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MERGE_PROMPT =
  "Merge these partial notes from consecutive parts of ONE recording into one set of notes. Remove duplicates. " +
  "Write the title and summary for the whole recording, without mentioning parts or merging. " +
  "Keep every rule from the system prompt, including at most 5 proposals.\n\n";

export abstract class ChunkedNotesGenerator implements NotesGenerator {
  abstract readonly name: string;
  protected abstract readonly maxCharsPerCall: number;
  protected abstract readonly pauseBetweenCallsMs: number;   // respects per-minute rate limits
  protected abstract callModel(mode: RecordingMode, content: string): Promise<Notes>;

  async generate(segments: Segment[], mode: RecordingMode): Promise<Notes> {
    // one call at a time, with a pause between calls, so we never burst over rate limits
    let calls = 0;
    const call = async (content: string) => {
      if (calls++ > 0) await sleep(this.pauseBetweenCallsMs);
      return this.callModel(mode, content);
    };

    const text = formatTranscript(segments);
    if (text.length <= this.maxCharsPerCall) return call(text);

    // MAP: notes for each part
    let notes: Notes[] = [];
    for (const part of splitByChars(text, this.maxCharsPerCall)) notes.push(await call(part));

    // REDUCE: merge in batches that fit one call, repeating until one result is left.
    // (Merging everything at once could exceed the per-call / per-minute limit on long recordings.)
    while (notes.length > 1) {
      const merged: Notes[] = [];
      for (const batch of batchForMerge(notes, this.maxCharsPerCall)) {
        merged.push(batch.length === 1 ? batch[0]! : await call(MERGE_PROMPT + JSON.stringify(batch)));
      }
      notes = merged;
    }
    return notes[0]!;
  }
}

/**
 * Groups partial notes so each merge call stays within `max` chars. Every batch except the
 * last has at least 2 items, so each round shrinks the list and the loop always ends
 * (a pair of very large notes may go over `max`; progress matters more).
 */
export function batchForMerge(items: Notes[], max: number) {
  const batches: Notes[][] = [];
  let cur: Notes[] = [];
  let size = 0;
  for (const item of items) {
    const len = JSON.stringify(item).length;
    if (cur.length >= 2 && size + len > max) { batches.push(cur); cur = []; size = 0; }
    cur.push(item);
    size += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function splitByChars(text: string, max: number) {
  const parts: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length > max && cur) { parts.push(cur); cur = ""; }
    cur += line + "\n";
  }
  if (cur) parts.push(cur);
  return parts;
}
