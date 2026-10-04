// Creates/updates Better Auth's tables (user, session, account, verification).
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/auth.js";

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
console.log(`Tables to create: ${toBeCreated.map((t) => t.table).join(", ") || "none"}`);
console.log(`Tables to update: ${toBeAdded.map((t) => t.table).join(", ") || "none"}`);
await runMigrations();
console.log("Better Auth migrations done");
process.exit(0);
