import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const defaults = { attempts: 3, backoff: { type: "exponential" as const, delay: 10_000 }, removeOnComplete: 100 };

export const queues = {
  transcribe: new Queue<{ recordingId: string }>("transcribe", { connection, defaultJobOptions: defaults }),
  // free-tier rate limits (HTTP 429): retry more often, a full minute apart
  notes: new Queue<{ recordingId: string }>("notes", {
    connection,
    defaultJobOptions: { ...defaults, attempts: 5, backoff: { type: "fixed", delay: 60_000 } },
  }),
};
export type Queues = typeof queues;
