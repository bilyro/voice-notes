import { z } from "zod";
import { SavedActionItem } from "./notes.js";
import { Recording } from "./recording.js";

/** `GET /api/action-items?status=` (Task 1.29) */
export const ActionItemStatus = z.enum(["open", "done", "all"]);

/** One action item with the recording it came from. The id changes whenever that recording's notes are saved. */
export const ActionItemEntry = SavedActionItem.extend({
  id: z.string(),                                     // a bigint, sent as a string
  recording: Recording.pick({ id: true, title: true, mode: true, language: true, createdAt: true }),
});

export const ActionItemPatch = z.object({ done: z.boolean() });

export type ActionItemStatus = z.infer<typeof ActionItemStatus>;
export type ActionItemEntry = z.infer<typeof ActionItemEntry>;
