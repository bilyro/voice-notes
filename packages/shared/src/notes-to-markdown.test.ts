import { describe, expect, it } from "vitest";
import type { Notes } from "./schemas/notes.js";
import { notesToMarkdown } from "./notes-to-markdown.js";

const empty: Notes = {
  title: "", summary: "", keyPoints: [], decisions: [], actionItems: [], proposals: [],
  openQuestions: [], concepts: [], reviewQuestions: [], ideas: [],
};

describe("notesToMarkdown", () => {
  it("prints every filled section in order", () => {
    const md = notesToMarkdown("Science fair planning", {
      ...empty,
      summary: "The team planned the science fair.",
      keyPoints: ["Grades five to seven take part."],
      decisions: ["Each class shows up to three projects."],
      actionItems: [
        { text: "Prepare the equipment list", owner: "Andrew", dueDate: "Wednesday" },
        { text: "Send the request to facilities", owner: "Marta", dueDate: null, done: true },
        { text: "Prepare certificates", owner: null, dueDate: null },
      ],
      proposals: ["Ask the principal about the jury."],
      openQuestions: ["Is there a budget for prizes?"],
      concepts: [{ term: "Jury", explanation: "The people who judge the projects." }],
      ideas: ["Invite parents."],
      reviewQuestions: ["How many projects can a class show?"],
    }, "Thursday, October 1");

    expect(md).toBe(`# Science fair planning
_Thursday, October 1_

## Summary
The team planned the science fair.

## Key points
- Grades five to seven take part.

## Decisions
- Each class shows up to three projects.

## Action items
- [ ] Prepare the equipment list — Andrew (Wednesday)
- [x] Send the request to facilities — Marta
- [ ] Prepare certificates

## Suggested next steps
_Ideas from the assistant. Nobody said these in the meeting._

- Ask the principal about the jury.

## Open questions
- Is there a budget for prizes?

## Concepts
- **Jury**: The people who judge the projects.

## Ideas
- Invite parents.

## Review questions
- How many projects can a class show?
`);
  });

  it("leaves out empty sections", () => {
    const md = notesToMarkdown("Quick memo", { ...empty, decisions: ["Go with plan B."] }, "Monday, October 5");
    expect(md).toBe("# Quick memo\n_Monday, October 5_\n\n## Decisions\n- Go with plan B.\n");
    expect(notesToMarkdown("Nothing", empty, "Monday, October 5")).toBe("# Nothing\n_Monday, October 5_\n");
  });
});
