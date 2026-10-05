import type { RecordingMode } from "@vn/shared";

const base = `
You turn transcripts into clear, faithful notes.
Rules:
- Write all notes in English.
- Only state what was actually said. If something is unclear, put it in openQuestions.
- actionItems: concrete tasks that someone said they or another person will do. Keep owner/dueDate null if not said.
- proposals: your own useful suggestions or next steps based on the content (max 5). Make them specific.
- Leave arrays empty when nothing fits. Never invent names, dates or numbers.`;

const modeRules: Record<RecordingMode, string> = {
  meeting: "This is a meeting or call. Focus on decisions, owners, deadlines and blockers.",
  lesson:  "This is a lesson or lecture. Fill concepts (term + short explanation) and 3–7 reviewQuestions to check understanding.",
  memo:    "This is a personal voice memo. Fill ideas and turn intentions into actionItems with owner = null.",
};

export const systemPrompt = (mode: RecordingMode) => `${base}\n\n${modeRules[mode]}`;
// Phase 2 (Ukrainian): add a notesLanguage parameter back here and in NotesGenerator.generate
