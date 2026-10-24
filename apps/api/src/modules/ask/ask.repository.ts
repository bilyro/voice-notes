import type { Knex } from "knex";
import type { LanguageCode } from "@vn/shared";
import { db } from "../../db.js";

export type Hit = { id: string; recording_id: string; text: string; score: number };
export type ExcerptLine = { id: string; recording_id: string; start_ms: number; text: string; rn: number };

/**
 * Task 2.3: finds the lines that may answer a question, among your recordings (or one of them).
 * Ids are bigints, which pg returns as strings. `words` come from `searchWords` (letters and digits only).
 */
export class AskRepository {
  constructor(private db: Knex) {}

  async owns(userId: string, recordingId: string) {
    return !!(await this.db("recordings").where({ id: recordingId, user_id: userId }).first("id"));
  }

  /** Your lines closest in meaning to the question (lines under 3 words say nothing on their own, as in search). */
  async closestLines(userId: string, queryVector: string, limit: number, recordingId?: string) {
    return this.db.transaction(async (trx) => {
      await trx.raw("set local hnsw.iterative_scan = relaxed_order");
      const { rows } = await trx.raw<{ rows: Hit[] }>(
        `select s.id, s.recording_id, s.text, 1 - (s.embedding <=> :q::vector) as score
         from transcript_segments s join recordings r on r.id = s.recording_id
         where r.user_id = :userId and (:recordingId::uuid is null or r.id = :recordingId::uuid)
           and s.embedding is not null
           and array_length(regexp_split_to_array(trim(s.text), '\\s+'), 1) >= 3
         order by s.embedding <=> :q::vector
         limit :limit`,
        { q: queryVector, userId, recordingId: recordingId ?? null, limit },
      );
      return rows;
    });
  }

  /**
   * Your lines with the question's rare words: names, places, numbers ("Ksenia", "minibus") that the meaning
   * model blurs. A word is rare when at most 5% of the lines (or 5 lines) have it, so "what", "the" and "що" drop
   * out in any language without a stop-word list. Lines with more and rarer words come first (each word weighs
   * ln(lines / lines with it), so a name found in 3 lines counts more than a word found in 30).
   */
  async rareWordLines(userId: string, words: string[], limit: number, recordingId?: string) {
    if (words.length === 0) return [];
    const { rows } = await this.db.raw<{ rows: Hit[] }>(
      `with mine as (
         select s.id, s.recording_id, s.text, s.tsv
         from transcript_segments s join recordings r on r.id = s.recording_id
         where r.user_id = :userId and (:recordingId::uuid is null or r.id = :recordingId::uuid)
       ), counted as (
         select w, (select count(*) from mine m where m.tsv @@ to_tsquery('simple', w || ':*')) as n
         from unnest(string_to_array(:words, ' ')) as w
       ), total as (
         select count(*) as n from mine
       ), rare as (
         select w, ln(greatest(total.n, 2)::float / counted.n) as weight
         from counted, total where counted.n > 0 and counted.n <= greatest(5, total.n * 0.05)
       )
       select m.id, m.recording_id, m.text, sum(rare.weight) as score
       from mine m join rare on m.tsv @@ to_tsquery('simple', rare.w || ':*')
       group by m.id, m.recording_id, m.text
       order by score desc, m.id
       limit :limit`,
      { userId, recordingId: recordingId ?? null, words: words.join(" "), limit },
    );
    return rows;
  }

  /** Each hit with the two lines before and after it, in order; `rn` is the line's position in its recording. */
  async excerptLines(ids: string[]) {
    const { rows } = await this.db.raw<{ rows: ExcerptLine[] }>(
      `with hits as (
         select id, recording_id from transcript_segments where id = any(string_to_array(:ids, ',')::bigint[])
       ), numbered as (
         select s.id, s.recording_id, s.start_ms, s.text,
                row_number() over (partition by s.recording_id order by s.start_ms, s.id)::int as rn
         from transcript_segments s where s.recording_id in (select recording_id from hits)
       )
       select n.id, n.recording_id, n.start_ms, n.text, n.rn
       from numbered n
       where exists (select 1 from numbered h join hits on hits.id = h.id
                     where h.recording_id = n.recording_id and n.rn between h.rn - 2 and h.rn + 2)
       order by n.recording_id, n.rn`,
      { ids: ids.join(",") },
    );
    return rows;
  }

  recordings(ids: string[]) {
    return this.db("recordings").whereIn("id", ids)
      .select<{ id: string; title: string; language: LanguageCode; created_at: Date }[]>("id", "title", "language", "created_at");
  }
}

export const askRepo = new AskRepository(db);
