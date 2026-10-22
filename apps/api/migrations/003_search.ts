import type { Knex } from "knex";

// Full-text search (Task 1.28). The 'simple' configuration: recordings are English, Ukrainian or Spanish, and
// Postgres has no Ukrainian dictionary, so words are only lowercased (no stemming) the same way for all three.
export async function up(knex: Knex) {
  await knex.raw("alter table transcript_segments add column tsv tsvector generated always as (to_tsvector('simple', text)) stored");
  await knex.raw("create index transcript_segments_tsv_idx on transcript_segments using gin (tsv)");
  // string values only, so JSON keys like "summary" never match
  await knex.raw(`create index notes_content_tsv_idx on notes using gin (jsonb_to_tsvector('simple', content, '["string"]'))`);
}

export async function down(knex: Knex) {
  await knex.raw("drop index notes_content_tsv_idx");
  await knex.raw("drop index transcript_segments_tsv_idx");
  await knex.raw("alter table transcript_segments drop column tsv");
}
