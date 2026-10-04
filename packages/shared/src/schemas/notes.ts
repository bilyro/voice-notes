import { z } from "zod";

export const ActionItem = z.object({
  text: z.string(),
  owner: z.string().nullable(),
  dueDate: z.string().nullable(),          // as said, e.g. "next Friday"
});

export const Notes = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(ActionItem),
  proposals: z.array(z.string()),          // AI suggestions / next steps
  openQuestions: z.array(z.string()),
  // mode-specific extras (empty arrays when not relevant)
  concepts: z.array(z.object({ term: z.string(), explanation: z.string() })),
  reviewQuestions: z.array(z.string()),
  ideas: z.array(z.string()),
});
export type Notes = z.infer<typeof Notes>;
