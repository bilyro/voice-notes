import type { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.raw("create extension if not exists vector");
  await knex.raw("create extension if not exists pgcrypto");

  await knex.schema.createTable("recordings", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("user_id").notNullable().index();          // id from Better Auth
    t.text("title").notNullable().defaultTo("Untitled recording");
    t.text("mode").notNullable();                     // meeting | lesson | memo
    t.text("language").notNullable().defaultTo("auto");
    t.text("status").notNullable().defaultTo("recording");
    t.text("source").notNullable();
    t.text("mime_type").notNullable();
    t.integer("chunk_count").notNullable().defaultTo(0);
    t.integer("duration_ms");
    t.text("audio_key");                              // normalized file in S3
    t.text("error");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("transcript_segments", (t) => {
    t.bigIncrements("id");
    t.uuid("recording_id").notNullable().references("recordings.id").onDelete("CASCADE").index();
    t.integer("start_ms").notNullable();
    t.integer("end_ms").notNullable();
    t.text("speaker");
    t.text("text").notNullable();
    t.specificType("embedding", "vector(1536)");      // filled in Phase 2
  });

  await knex.schema.createTable("notes", (t) => {
    t.bigIncrements("id");
    t.uuid("recording_id").notNullable().references("recordings.id").onDelete("CASCADE").index();
    t.integer("version").notNullable().defaultTo(1);
    t.jsonb("content").notNullable();
    t.boolean("edited_by_user").notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("action_items", (t) => {
    t.bigIncrements("id");
    t.uuid("recording_id").notNullable().references("recordings.id").onDelete("CASCADE").index();
    t.text("user_id").notNullable().index();
    t.text("text").notNullable();
    t.text("owner");
    t.text("due_date");
    t.boolean("done").notNullable().defaultTo(false);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTable("action_items");
  await knex.schema.dropTable("notes");
  await knex.schema.dropTable("transcript_segments");
  await knex.schema.dropTable("recordings");
}
