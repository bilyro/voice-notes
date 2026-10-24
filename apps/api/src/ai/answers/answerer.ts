import { z } from "zod";

/** What the model returns (Task 2.3): `found: false` when the excerpts don't answer the question. */
export const ModelAnswer = z.object({
  found: z.boolean().describe("true only if the excerpts answer the question"),
  answer: z.string().describe("the answer citing excerpts as [1], [2]; empty when found is false"),
});
export type ModelAnswer = z.infer<typeof ModelAnswer>;

/** A few transcript lines from one recording, numbered for citing. */
export type Excerpt = { n: number; title: string; date: string; time: string; text: string };

export interface Answerer {
  readonly name: string;
  answer(question: string, excerpts: Excerpt[]): Promise<ModelAnswer>;
}

/** The system prompt every adapter sends; `today` lets the model place "last week" and dates. */
export const answerPrompt = (today: string) => `
You answer questions about the user's own recordings (meetings, lessons, voice memos), using only the numbered transcript excerpts you are given.
Rules:
- Use only what the excerpts say. Never add outside knowledge, and never guess names, dates or numbers.
- Each excerpt is a separate moment. Use an excerpt only if it is clearly about what the question asks: a number or a name from an excerpt about something else is not an answer.
- End every sentence (and every list item) with the number of the excerpt it comes from, in square brackets, like [2] or [1][3]. An answer without these numbers is wrong.
- Answer in the language of the question, even when the excerpts are in another language.
- Be brief: one to four sentences, or a short list when the question asks for several things.
- Plain text only, no Markdown: no bold, no headings. For a list, start each item on its own line with "- ".
- Transcripts can contain recognition mistakes; read past them.
- If the excerpts don't answer the question, set found to false and leave the answer empty. If they answer only part of it, answer that part and say what is missing.
Today is ${today}.`.trim();

/** "[1] Planning day (Oct 20, 2026), from 12:05:\n…lines…" */
export const formatExcerpts = (excerpts: Excerpt[]) =>
  excerpts.map((e) => `[${e.n}] ${e.title} (${e.date}), from ${e.time}:\n${e.text}`).join("\n\n");

export const userMessage = (question: string, excerpts: Excerpt[]) =>
  `Excerpts:\n\n${formatExcerpts(excerpts)}\n\nQuestion: ${question}`;
