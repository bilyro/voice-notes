// Task 2.1: queue the embed job for every recording that has lines without embeddings (run once after deploying 2.1;
// the worker does the work). pnpm --filter @vn/api tsx scripts/embed-backfill.ts
import { db } from "../src/db.js";
import { connection, queues } from "../src/queue/queues.js";

const ids = await db("transcript_segments").whereNull("embedding").distinct("recording_id").pluck<string[]>("recording_id");
for (const id of ids) await queues.embed.add("embed", { recordingId: id }, { jobId: `embed-${id}-${Date.now()}` });
console.log(`queued ${ids.length} recording(s); the worker fills their lines`);
await Promise.all([queues.transcribe.close(), queues.notes.close(), queues.embed.close()]);
await connection.quit();
await db.destroy();
