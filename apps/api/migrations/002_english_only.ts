import type { Knex } from "knex";

export async function up(knex: Knex) {
  await knex("recordings").whereNot("language", "en").update({ language: "en" });
  await knex.raw("alter table recordings alter column language set default 'en'");
}

export async function down(knex: Knex) {
  await knex.raw("alter table recordings alter column language set default 'auto'");
}
