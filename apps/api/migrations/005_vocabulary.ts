import type { Knex } from "knex";

// Task 1.37: names and terms said in the recording ("Olena, Riverside School, PTA"), a hint for the transcript and the notes
export async function up(knex: Knex) {
  await knex.schema.alterTable("recordings", (t) => {
    t.text("vocabulary");
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable("recordings", (t) => {
    t.dropColumn("vocabulary");
  });
}
