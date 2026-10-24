import { MARK_END, MARK_START, type SearchMatch, type SearchResult } from "@vn/shared";
import { toPgVector } from "../../ai/embeddings/embedder.js";
import type { Embedder } from "../../ai/embeddings/embedder.js";
import { config } from "../../config.js";
import { toRecording } from "../recordings/recordings.repository.js";
import type { SearchRepository } from "./search.repository.js";

const MAX_RECORDINGS = 20;
const MAX_MATCHES = 3;          // per recording: title first, then notes, then where it was said

/** "Science fair, 4:12!" → ["science", "fair", "4", "12"]: letters and digits in any script, so the tsquery can't be malformed. */
export const searchWords = (q: string) => (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);

/** Every word must match, each as a prefix ("scien" finds "science"). */
export const toTsquery = (words: string[]) => words.map((w) => `${w}:*`).join(" & ");

/** Marks each word in the title (the database marks notes and transcript snippets). */
export function markTitle(title: string, words: string[]) {
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
  return title.replace(pattern, `${MARK_START}$1${MARK_END}`);
}

export class SearchService {
  constructor(private repo: SearchRepository, private embedder: Embedder) {}

  async search(userId: string, q: string): Promise<SearchResult[]> {
    const words = searchWords(q);
    if (words.length === 0) return [];
    const tsquery = toTsquery(words);
    const [titles, notes, lines, meaning] = await Promise.all([
      this.repo.titleMatches(userId, words, MAX_RECORDINGS),
      this.repo.notesMatches(userId, tsquery, MAX_RECORDINGS),
      this.repo.transcriptMatches(userId, tsquery, MAX_MATCHES),
      this.meaning(userId, q),
    ]);

    const matches = new Map<string, SearchMatch[]>();
    const add = (id: string, m: SearchMatch) => {
      const list = matches.get(id) ?? [];
      if (list.length < MAX_MATCHES) list.push(m);
      matches.set(id, list);
    };
    for (const r of titles) add(r.id, { kind: "title", snippet: markTitle(r.title, words) });
    for (const n of notes) add(n.recording_id, { kind: "notes", snippet: n.snippet });
    for (const s of lines) add(s.recording_id, { kind: "transcript", snippet: s.snippet, startMs: s.start_ms });

    // Task 2.2: lines found by what they mean, after the word matches; a line already found by its words isn't repeated
    const byWords = new Set(matches.keys());
    const onlyByMeaning: string[] = [];                     // recordings found only this way, best match first
    for (const m of meaning) {
      if (matches.get(m.recording_id)?.some((x) => x.startMs === m.start_ms)) continue;
      if (!byWords.has(m.recording_id) && !onlyByMeaning.includes(m.recording_id)) onlyByMeaning.push(m.recording_id);
      add(m.recording_id, { kind: "meaning", snippet: m.text, startMs: m.start_ms });
    }
    if (matches.size === 0) return [];

    const recordings = await this.repo.recordings(userId, [...matches.keys()]);   // newest first
    const ordered = [
      ...recordings.filter((r) => byWords.has(r.id)),
      ...onlyByMeaning.map((id) => recordings.find((r) => r.id === id)!).filter(Boolean),
    ];
    return ordered.slice(0, MAX_RECORDINGS).map((r) => ({ recording: toRecording(r), matches: matches.get(r.id)! }));
  }

  /** Your closest lines by meaning above the tuned threshold. If the model fails, search by words still works. */
  private async meaning(userId: string, q: string) {
    try {
      const vector = toPgVector(await this.embedder.embedQuery(q));
      const rows = await this.repo.meaningMatches(userId, vector, 20);
      return rows.filter((r) => r.score >= config.SEMANTIC_MIN_SCORE).slice(0, 10);
    } catch (e) {
      console.error("search by meaning failed:", e);
      return [];
    }
  }
}
