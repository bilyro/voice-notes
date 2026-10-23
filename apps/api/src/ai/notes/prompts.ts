import { LANGUAGE_NAMES, type LanguageCode, type RecordingMode } from "@vn/shared";

const base = (language: LanguageCode) => `
You turn transcripts into clear, faithful notes.
Rules:
- Write all notes in ${LANGUAGE_NAMES[language]}, the language of the recording. Only the JSON keys stay in English.
- Only state what was actually said. If something is unclear, put it in openQuestions.
- actionItems: concrete tasks that someone said they or another person will do. Keep owner/dueDate null if not said.
- dueDate: the deadline in the speaker's own words, e.g. "Friday, April 11", "next week", "by the end of term". Never turn it into a numeric date (YYYY-MM-DD), and never add a year that wasn't said.
- proposals: your own useful suggestions or next steps based on the content (max 5). Make them specific.
- Leave arrays empty when nothing fits. Never invent names, dates or numbers.`;

const modeRules: Record<RecordingMode, string> = {
  meeting: "This is a meeting or call. Focus on decisions, owners, deadlines and blockers.",
  lesson:  "This is a lesson or lecture. Fill concepts (term + short explanation) and 3–7 reviewQuestions to check understanding.",
  memo:    "This is a personal voice memo. Fill ideas and turn intentions into actionItems with owner = null.",
};

/** `vocabulary`: names and terms as they should be spelled (Task 1.37). */
export const systemPrompt = (mode: RecordingMode, language: LanguageCode, vocabulary?: string | null) =>
  `${base(language)}${vocabulary ? `\n- Spell these names and terms exactly like this: ${vocabulary}` : ""}\n\n${modeRules[mode]}`;
