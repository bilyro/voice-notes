import { z } from "zod";

export const Segment = z.object({
  startMs: z.number().int(),
  endMs: z.number().int(),
  speaker: z.string().nullable(),   // null until diarization (Phase 2)
  text: z.string(),
});
export type Segment = z.infer<typeof Segment>;
