import type { Notes } from "./schemas/notes.js";

type ExportNotes = Omit<Notes, "actionItems"> & { actionItems: (Notes["actionItems"][number] & { done?: boolean })[] };

/** Notes as a Markdown document (Copy as Markdown / Download .md). Empty sections are left out. */
export function notesToMarkdown(title: string, n: ExportNotes, date: string) {
  const list = (h: string, items: string[]) => (items.length ? `## ${h}\n${items.map((i) => `- ${i}`).join("\n")}\n` : "");
  return [
    `# ${title}\n_${date}_\n`,
    n.summary ? `## Summary\n${n.summary}\n` : "",
    list("Key points", n.keyPoints),
    list("Decisions", n.decisions),
    n.actionItems.length
      ? `## Action items\n${n.actionItems.map((a) => `- [${a.done ? "x" : " "}] ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.dueDate ? ` (${a.dueDate})` : ""}`).join("\n")}\n`
      : "",
    // AI suggestions keep their label outside the app too (docs/DESIGN.md: facts vs suggestions)
    n.proposals.length
      ? `## Suggested next steps\n_Ideas from the assistant. Nobody said these in the meeting._\n\n${n.proposals.map((p) => `- ${p}`).join("\n")}\n`
      : "",
    list("Open questions", n.openQuestions),
    n.concepts.length
      ? `## Concepts\n${n.concepts.map((c) => `- **${c.term}**: ${c.explanation}`).join("\n")}\n`
      : "",
    list("Ideas", n.ideas),
    list("Review questions", n.reviewQuestions),
  ].filter(Boolean).join("\n");
}
