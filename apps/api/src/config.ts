import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  // BullMQ key prefix. The tests set their own (package.json), so a running dev worker never takes their jobs
  QUEUE_PREFIX: z.string().default("bull"),
  S3_ENDPOINT: z.string(),
  S3_REGION: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  WEB_ORIGIN: z.string(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string(),
  // AI keys are optional here: the API server must start without them (the worker checks them)
  STT_PROVIDER: z.enum(["groq", "openai"]).default("groq"),
  NOTES_PROVIDER: z.enum(["groq", "claude"]).default("groq"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_NOTES_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_NOTES_MAX_CHARS: z.coerce.number().default(16_000),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NOTES_MODEL: z.string().default("claude-haiku-4-5"),
  MONTHLY_MINUTES_LIMIT: z.coerce.number().default(600),
  // Task 1.35: refuse passwords found in data breaches (api.pwnedpasswords.com); the API tests switch it off
  PASSWORD_BREACH_CHECK: z.stringbool().default(true),
});

export const config = Env.parse(process.env); // crash early if env is wrong

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1"; // Groq is OpenAI-compatible
