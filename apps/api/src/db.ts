import { fileURLToPath } from "node:url";
import knex, { type Knex } from "knex";
import { config } from "./config.js";

export const knexConfig: Knex.Config = {
  client: "pg",
  connection: config.DATABASE_URL,
  migrations: {
    // absolute, so it works from both the knex CLI and the app
    directory: fileURLToPath(new URL("../migrations", import.meta.url)),
    extension: "ts",
    loadExtensions: [".ts"],
  },
};

export const db = knex(knexConfig);
