import { MARK_END, MARK_START, type SearchMatch, type SearchResult } from "@vn/shared";
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
  constructor(private repo: SearchRepository) {}

  async search(userId: string, q: string): Promise<SearchResult[]> {
    const words = searchWords(q);
    if (words.length === 0) return [];
    const tsquery = toTsquery(words);
    const [titles, notes, lines] = await Promise.all([
      this.repo.titleMatches(userId, words, MAX_RECORDINGS),
      this.repo.notesMatches(userId, tsquery, MAX_RECORDINGS),
      this.repo.transcriptMatches(userId, tsquery, MAX_MATCHES),
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
    if (matches.size === 0) return [];

    const recordings = await this.repo.recordings(userId, [...matches.keys()]);
    return recordings.slice(0, MAX_RECORDINGS).map((r) => ({ recording: toRecording(r), matches: matches.get(r.id)! }));
  }
}
