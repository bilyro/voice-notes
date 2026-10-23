import { z } from "zod";

export const Segment = z.object({
  startMs: z.number().int(),
  endMs: z.number().int(),
  speaker: z.string().nullable(),   // null until diarization (Phase 2)
  text: z.string(),
});
export type Segment = z.infer<typeof Segment>;

/** A saved transcript line, as the API sends it: the id lets you edit it (Task 1.38). */
export const TranscriptLine = Segment.extend({ id: z.string() });
export type TranscriptLine = z.infer<typeof TranscriptLine>;

/** `PATCH /api/recordings/:id/segments/:segmentId` */
export const SegmentEdit = z.object({ text: z.string().trim().min(1, "A line can't be empty").max(2000) });
