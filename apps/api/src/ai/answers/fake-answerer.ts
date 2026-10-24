// used in tests, no network: answers from the first excerpt, or "not found" when the question says "nothing"
import type { Answerer, Excerpt, ModelAnswer } from "./answerer.js";

export class FakeAnswerer implements Answerer {
  readonly name = "fake";
  /** what the last call was given, so tests can check which excerpts reached the model */
  last?: { question: string; excerpts: Excerpt[] };

  async answer(question: string, excerpts: Excerpt[]): Promise<ModelAnswer> {
    this.last = { question, excerpts };
    if (/nothing/i.test(question)) return { found: false, answer: "" };
    return { found: true, answer: `It's in the recording [${excerpts.length}][1].` };
  }
}
