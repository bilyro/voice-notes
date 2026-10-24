import type { Knex } from "knex";

// Task 2.1: 384 numbers per line (multilingual-e5-small), not the 1536 planned for OpenAI (never filled),
// plus an HNSW index for fast "closest lines" queries by cosine distance
export async function up(knex: Knex) {
  await knex.raw("alter table transcript_segments drop column embedding");
  await knex.raw("alter table transcript_segments add column embedding vector(384)");
  await knex.raw("create index transcript_segments_embedding_idx on transcript_segments using hnsw (embedding vector_cosine_ops)");
}

export async function down(knex: Knex) {
  await knex.raw("drop index transcript_segments_embedding_idx");
  await knex.raw("alter table transcript_segments drop column embedding");
  await knex.raw("alter table transcript_segments add column embedding vector(1536)");
}
