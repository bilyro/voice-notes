import { Worker } from "bullmq";
import { config } from "./config.js";
import { connection } from "./queue/queues.js";
import { transcribeJob } from "./jobs/transcribe.job.js";
import { notesJob } from "./jobs/notes.job.js";
import { embedJob } from "./jobs/embed.job.js";
import { markFailed } from "./jobs/mark-failed.js";

const opts = { connection, concurrency: 2, prefix: config.QUEUE_PREFIX };

for (const w of [
  new Worker("transcribe", (job) => transcribeJob(job.data.recordingId), opts),
  new Worker("notes", (job) => notesJob(job.data.recordingId), opts),
  // one at a time: the model uses the CPU
  new Worker("embed", (job) => embedJob(job.data.recordingId), { ...opts, concurrency: 1 }),
]) {
  w.on("failed", async (job, err) => {
    // only mark failed after the last retry
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) await markFailed(job.data.recordingId, err.message);
  });
}
console.log("Worker started");
