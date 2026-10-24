import { z } from "zod";
import { LanguageCode } from "./recording.js";

/** `POST /api/ask` (Task 2.3): a question about your recordings, or about one of them. */
export const AskRequest = z.object({
  question: z.string().trim().min(2).max(500),
  recordingId: z.uuid().optional(),
});

/** One excerpt the answer cites as [n]: a few transcript lines, linked to the moment they start. */
export const AskSource = z.object({
  n: z.number().int().min(1),
  recordingId: z.string(),
  title: z.string(),
  language: LanguageCode,
  startMs: z.number().int(),
  text: z.string(),
});

/** `found: false` → the recordings don't answer it; `answer` is then the fixed "I couldn't find…" line and no sources. */
export const AskAnswer = z.object({
  found: z.boolean(),
  answer: z.string(),
  sources: z.array(AskSource),
});

export const NOT_FOUND_ANSWER = "I couldn't find that in your recordings.";

export type AskRequest = z.infer<typeof AskRequest>;
export type AskSource = z.infer<typeof AskSource>;
export type AskAnswer = z.infer<typeof AskAnswer>;
