import { NOT_FOUND_ANSWER, type AskAnswer, type AskRequest, type AskSource } from "@vn/shared";
import type { Answerer, Excerpt, ModelAnswer } from "../../ai/answers/answerer.js";
import { toPgVector, type Embedder } from "../../ai/embeddings/embedder.js";
import { httpError } from "../../lib/http-error.js";
import type { AskRepository, Hit } from "./ask.repository.js";

const MAX_LINES = 12;          // lines found for a question; each goes to the model with two lines before and after
const BY_MEANING = 24;                 // more than needed: repeated phrases are dropped below
const BY_WORDS = 6;
// below this, a line has nothing to do with the question. Far lower than search's cut-off (Task 2.2): the model
// reads the lines and says when they don't answer, and a question in another language than the recording scores
// low even on the right line (a Ukrainian question → the English line 0.77, measured on the test recordings)
export const ASK_MIN_SCORE = 0.75;

const NOT_FOUND: AskAnswer = { found: false, answer: NOT_FOUND_ANSWER, sources: [] };

/** All the words of a question, lower case, letters and digits in any script (no tsquery syntax can get through). */
export const questionWords = (q: string) => [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 40);

/** "0:46", "1:02:05" */
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60) % 60), ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

type Found = Omit<AskSource, "n"> & { lines: string[]; date: string };

/**
 * Renumbers the model's citations in the order they first appear ([4] … [1] → [1] … [2]), drops numbers that
 * aren't an excerpt, and returns only the excerpts the answer cites. "[1, 3]" becomes "[1][2]".
 */
export function cite(answer: string, found: Found[]): Pick<AskAnswer, "answer" | "sources"> {
  const order: number[] = [];
  const text = answer
    .replace(/\s*\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, (_m, list: string) => {
      const ns = [...new Set(list.split(/[,;]/).map((s) => Number(s.trim())))].filter((n) => n >= 1 && n <= found.length);
      for (const n of ns) if (!order.includes(n)) order.push(n);
      return ns.length ? ns.map((n) => `[${order.indexOf(n) + 1}]`).join("") : "";
    })
    .replace(/(\[\d+\])\1+/g, "$1")
    .trim();
  const sources = order.map((old, i) => {
    const f = found[old - 1]!;
    return { n: i + 1, recordingId: f.recordingId, title: f.title, language: f.language, startMs: f.startMs, text: f.text };
  });
  return { answer: text, sources };
}

export class AskService {
  constructor(private repo: AskRepository, private embedder: Embedder, private answerer: Answerer) {}

  async ask(userId: string, { question, recordingId }: AskRequest): Promise<AskAnswer> {
    if (recordingId && !(await this.repo.owns(userId, recordingId))) throw httpError(404, "Recording not found");
    const hits = await this.retrieve(userId, question, recordingId);
    if (hits.length === 0) return NOT_FOUND;                     // nothing close: no need to ask the model
    const found = await this.excerpts(hits);
    const excerpts: Excerpt[] = found.map((f, i) => ({ n: i + 1, title: f.title, date: f.date, time: clock(f.startMs), text: f.lines.join("\n") }));

    let out: ModelAnswer;
    try {
      out = await this.answerer.answer(question, excerpts);
    } catch (e) {
      if (e instanceof Error && "statusCode" in e) throw e;
      if (e instanceof Error && "status" in e && e.status === 429) throw httpError(429, "Too many questions at once. Wait a minute, then ask again.");
      console.error("ask: the answer model failed:", e);
      throw httpError(502, "The answer couldn't be written just now. Try again in a moment.");
    }
    if (!out.found || !out.answer.trim()) return NOT_FOUND;
    return { found: true, ...cite(out.answer, found) };
  }

  /** The best lines by meaning and by rare words, taken in turns, best first; no line (or the same words) twice. */
  private async retrieve(userId: string, question: string, recordingId?: string) {
    const [byMeaning, byWords] = await Promise.all([
      this.closest(userId, question, recordingId),
      this.repo.rareWordLines(userId, questionWords(question), BY_WORDS, recordingId),
    ]);
    const hits: Hit[] = [];
    const said = new Set<string>();                              // a phrase said again (or a re-uploaded recording)
    for (let i = 0; hits.length < MAX_LINES && (i < byMeaning.length || i < byWords.length); i++) {
      for (const h of [byMeaning[i], byWords[i]]) {
        const words = h?.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        if (h && words !== undefined && hits.length < MAX_LINES && !said.has(words)) {
          said.add(words);
          hits.push(h);
        }
      }
    }
    return hits;
  }

  /** If the embeddings model fails, the rare words still find something. */
  private async closest(userId: string, question: string, recordingId?: string) {
    try {
      const vector = toPgVector(await this.embedder.embedQuery(question));
      return (await this.repo.closestLines(userId, vector, BY_MEANING, recordingId)).filter((r) => r.score >= ASK_MIN_SCORE);
    } catch (e) {
      console.error("ask: search by meaning failed:", e);
      return [];
    }
  }

  /** Neighbouring hits merge into one excerpt; excerpts come in the order of their best hit. */
  private async excerpts(hits: Hit[]): Promise<Found[]> {
    const rank = new Map(hits.map((h, i) => [String(h.id), i]));
    const [lines, recordings] = await Promise.all([
      this.repo.excerptLines(hits.map((h) => String(h.id))),
      this.repo.recordings([...new Set(hits.map((h) => h.recording_id))]),
    ]);
    const runs: { lines: typeof lines; best: number }[] = [];
    for (const line of lines) {                                  // ordered by recording, then position
      const last = runs.at(-1);
      const prev = last?.lines.at(-1);
      const run = prev && prev.recording_id === line.recording_id && prev.rn === line.rn - 1 ? last! : { lines: [], best: Infinity };
      if (run !== last) runs.push(run);
      run.lines.push(line);
      run.best = Math.min(run.best, rank.get(String(line.id)) ?? Infinity);
    }
    return runs.sort((a, b) => a.best - b.best).map(({ lines: run }) => {
      const rec = recordings.find((r) => r.id === run[0]!.recording_id)!;
      return {
        recordingId: rec.id,
        title: rec.title,
        language: rec.language,
        date: new Date(rec.created_at).toDateString(),
        startMs: run[0]!.start_ms,
        text: run.map((l) => l.text.trim()).join(" "),
        lines: run.map((l) => l.text.trim()),
      };
    });
  }
}
