// used in tests, no network
import type { Notes } from "@vn/shared";
import type { NotesGenerator } from "./notes-generator.js";

export class FakeNotes implements NotesGenerator {
  readonly name = "fake";
  async generate(): Promise<Notes> {
    return {
      title: "Lesson plan review",
      summary: "The team went over the lesson plan for next week.",
      keyPoints: ["The lesson plan for next week was reviewed."],
      decisions: [],
      actionItems: [{ text: "Prepare the quiz", owner: "Olena", dueDate: "Friday" }],
      proposals: ["Share the quiz with the class a day before."],
      openQuestions: [],
      concepts: [],
      reviewQuestions: [],
      ideas: [],
    };
  }
}
