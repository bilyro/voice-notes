import { z } from "zod";
import { SavedNotes } from "./notes.js";
import { Recording } from "./recording.js";

/** `POST /api/recordings/:id/share` (Task 1.30) */
export const ShareLink = z.object({ token: z.string() });

/** `GET /api/shared/:token`: the notes only. No transcript, no audio, nothing about the owner. */
export const SharedRecording = Recording.pick({ title: true, mode: true, language: true, createdAt: true, durationMs: true })
  .extend({ notes: SavedNotes });

export type ShareLink = z.infer<typeof ShareLink>;
export type SharedRecording = z.infer<typeof SharedRecording>;
