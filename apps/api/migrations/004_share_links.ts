import type { Knex } from "knex";

// Task 1.30: a read-only link to the notes. NULL = no link; deleting the recording ends the link with it.
export async function up(knex: Knex) {
  await knex.schema.alterTable("recordings", (t) => {
    t.text("share_token").unique();
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable("recordings", (t) => {
    t.dropColumn("share_token");
  });
}
