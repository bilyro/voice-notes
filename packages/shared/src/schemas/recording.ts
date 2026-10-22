import { z } from "zod";

export const RecordingMode = z.enum(["meeting", "lesson", "memo"]);
export const RecordingStatus = z.enum([
  "recording", "uploaded", "transcribing", "summarizing", "ready", "failed",
]);
// the language spoken in the recording; the transcript and the notes use it too ("auto" may come in Phase 2)
export const LanguageCode = z.enum(["en", "uk", "es"]);

export const CreateRecordingInput = z.object({
  title: z.string().min(1).max(200).optional(),
  mode: RecordingMode,
  language: LanguageCode.default("en"),
  mimeType: z.string(),                     // e.g. "audio/webm;codecs=opus"
  source: z.enum(["web", "desktop", "mobile"]),
});

export const Recording = z.object({
  id: z.uuid(),
  title: z.string(),
  mode: RecordingMode,
  language: LanguageCode,
  status: RecordingStatus,
  durationMs: z.number().int().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

export type Recording = z.infer<typeof Recording>;
export type CreateRecordingInput = z.infer<typeof CreateRecordingInput>;
export type RecordingMode = z.infer<typeof RecordingMode>;
export type LanguageCode = z.infer<typeof LanguageCode>;

/** English names: the app's UI is English, and the notes prompt names the language this way. */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = { en: "English", uk: "Ukrainian", es: "Spanish" };
