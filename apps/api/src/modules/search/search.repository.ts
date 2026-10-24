import type { Knex } from "knex";
import { MARK_END, MARK_START } from "@vn/shared";
import { db } from "../../db.js";
import type { RecordingRow } from "../recordings/recordings.repository.js";

// one fragment of about 10–24 words around the match, the matched words between the two marks
const HEADLINE = `StartSel=${MARK_START}, StopSel=${MARK_END}, MinWords=10, MaxWords=24, ShortWord=1, MaxFragments=1`;

/** `tsquery` is built by the service from letters and digits only, e.g. "science:* & fair:*". */
export class SearchRepository {
  constructor(private db: Knex) {}

  /** Your recordings whose title contains every word (case-insensitive). */
  titleMatches(userId: string, words: string[], limit: number) {
    let q = this.db<RecordingRow>("recordings").where({ user_id: userId });
    for (const w of words) q = q.whereILike("title", `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    return q.orderBy("created_at", "desc").limit(limit);
  }

  /** Recordings whose latest notes match, with a marked snippet from the notes' text (string values only). */
  async notesMatches(userId: string, tsquery: string, limit: number) {
    const { rows } = await this.db.raw<{ rows: { recording_id: string; snippet: string }[] }>(
      `select n.recording_id, ts_headline('simple', t.text, to_tsquery('simple', :tsquery), :headline) as snippet
       from (select distinct on (n0.recording_id) n0.recording_id, n0.content, r0.created_at
             from notes n0 join recordings r0 on r0.id = n0.recording_id
             where r0.user_id = :userId
             order by n0.recording_id, n0.version desc) n
       cross join lateral (select string_agg(v #>> '{}', ' · ') as text
                           from jsonb_path_query(n.content, 'strict $.**') v where jsonb_typeof(v) = 'string') t
       where jsonb_to_tsvector('simple', n.content, '["string"]') @@ to_tsquery('simple', :tsquery)
       order by n.created_at desc
       limit :limit`,
      { tsquery, headline: HEADLINE, userId, limit },
    );
    return rows;
  }

  /** The first `perRecording` matching transcript lines of each of your recordings, with marked snippets. */
  async transcriptMatches(userId: string, tsquery: string, perRecording: number) {
    const { rows } = await this.db.raw<{ rows: { recording_id: string; start_ms: number; snippet: string }[] }>(
      `select recording_id, start_ms, snippet from (
         select s.recording_id, s.start_ms, r.created_at,
                ts_headline('simple', s.text, to_tsquery('simple', :tsquery), :headline) as snippet,
                row_number() over (partition by s.recording_id order by s.start_ms) as rn
         from transcript_segments s join recordings r on r.id = s.recording_id
         where r.user_id = :userId and s.tsv @@ to_tsquery('simple', :tsquery)
       ) x
       where rn <= :perRecording
       order by created_at desc, start_ms
       limit 200`,
      { tsquery, headline: HEADLINE, userId, perRecording },
    );
    return rows;
  }

  /**
   * Task 2.2: your lines closest in meaning to the query vector, with their similarity (1 − cosine distance).
   * Lines under 3 words ("…", "Okay.") are skipped: they match everything a little and say nothing.
   * pgvector's iterative scan keeps reading the HNSW index until enough of *your* lines are found.
   */
  async meaningMatches(userId: string, queryVector: string, limit: number) {
    return this.db.transaction(async (trx) => {
      await trx.raw("set local hnsw.iterative_scan = relaxed_order");
      const { rows } = await trx.raw<{ rows: { recording_id: string; start_ms: number; text: string; score: number }[] }>(
        `select s.recording_id, s.start_ms, s.text, 1 - (s.embedding <=> :q::vector) as score
         from transcript_segments s join recordings r on r.id = s.recording_id
         where r.user_id = :userId and s.embedding is not null
           and array_length(regexp_split_to_array(trim(s.text), '\\s+'), 1) >= 3
         order by s.embedding <=> :q::vector
         limit :limit`,
        { q: queryVector, userId, limit },
      );
      return rows;
    });
  }

  /** Your recordings with these ids, newest first. */
  recordings(userId: string, ids: string[]) {
    return this.db<RecordingRow>("recordings").where({ user_id: userId }).whereIn("id", ids).orderBy("created_at", "desc");
  }
}

export const searchRepo = new SearchRepository(db);
