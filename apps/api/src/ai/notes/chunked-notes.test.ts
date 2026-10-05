import { describe, expect, it } from "vitest";
import type { Notes, RecordingMode, Segment } from "@vn/shared";
import { batchForMerge, ChunkedNotesGenerator, splitByChars } from "./chunked-notes.js";

const notes = (summary: string): Notes => ({
  title: "t", summary, keyPoints: [], decisions: [], actionItems: [], proposals: [],
  openQuestions: [], concepts: [], reviewQuestions: [], ideas: [],
});

describe("splitByChars", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `[00:00:${String(i % 60).padStart(2, "0")}] line ${i} ${"x".repeat(i % 37)}`);
  const text = lines.join("\n");

  it("never cuts a line and has no empty parts", () => {
    const parts = splitByChars(text, 500);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.trim()).not.toBe("");
    // every line survives whole and in order
    expect(parts.join("").split("\n").filter(Boolean)).toEqual(lines);
  });

  it("keeps parts within max when every line fits", () => {
    for (const p of splitByChars(text, 500)) expect(p.length).toBeLessThanOrEqual(500);
  });

  it("puts a line longer than max into its own part instead of cutting it", () => {
    const long = "y".repeat(80);
    expect(splitByChars(`a\n${long}\nb`, 50)).toEqual(["a\n", `${long}\n`, "b\n"]);
  });

  it("returns one part when the text fits", () => {
    expect(splitByChars("a\nb", 100)).toEqual(["a\nb\n"]);
  });
});

describe("batchForMerge", () => {
  const items = Array.from({ length: 9 }, (_, i) => notes("s".repeat(50 + i * 10)));
  const size = (b: Notes[]) => b.reduce((n, x) => n + JSON.stringify(x).length, 0);

  it("keeps batches under max when possible and gives every batch but the last ≥ 2 items", () => {
    const max = 600;
    const batches = batchForMerge(items, max);
    expect(batches.flat()).toEqual(items);
    for (const b of batches.slice(0, -1)) {
      expect(b.length).toBeGreaterThanOrEqual(2);
      expect(size(b)).toBeLessThanOrEqual(max);
    }
  });

  it("still pairs items that are each larger than max, so the list always shrinks", () => {
    const big = [notes("a".repeat(300)), notes("b".repeat(300)), notes("c".repeat(300))];
    const batches = batchForMerge(big, 100);
    expect(batches.map((b) => b.length)).toEqual([2, 1]);
  });
});

/** callModel is fake: no network, no pause. Merge calls combine the summaries so the test can check nothing is lost. */
class TestNotes extends ChunkedNotesGenerator {
  readonly name = "test";
  protected readonly maxCharsPerCall = 1_000;
  protected readonly pauseBetweenCallsMs = 0;
  calls: string[] = [];

  protected async callModel(_mode: RecordingMode, content: string): Promise<Notes> {
    this.calls.push(content);
    if (content.startsWith("Merge these partial notes")) {
      const batch = JSON.parse(content.slice(content.indexOf("["))) as Notes[];
      return notes(batch.map((n) => n.summary).join("+"));
    }
    return notes(`part${this.calls.length}`);
  }
}

describe("ChunkedNotesGenerator.generate", () => {
  const segments = (n: number): Segment[] =>
    Array.from({ length: n }, (_, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, speaker: null, text: `Sentence number ${i} of the meeting.` }));

  it("uses one call when the transcript fits", async () => {
    const gen = new TestNotes();
    await gen.generate(segments(5), "meeting");
    expect(gen.calls).toHaveLength(1);
  });

  it("maps a long transcript in parts and reduces to exactly one result", async () => {
    const gen = new TestNotes();
    const result = await gen.generate(segments(2_000), "lesson");   // ≈ 90k chars → ~90 parts
    const mapCalls = gen.calls.filter((c) => !c.startsWith("Merge"));
    expect(mapCalls.length).toBeGreaterThan(50);
    // every part's notes made it into the single final result
    expect(result.summary.split("+").sort()).toEqual(mapCalls.map((_, i) => `part${i + 1}`).sort());
    // the notes inside each merge call stay within max (they are small here, so batching never has to go over)
    for (const c of gen.calls.filter((c) => c.startsWith("Merge"))) expect(c.length - c.indexOf("[")).toBeLessThanOrEqual(1_000);
  });
});
