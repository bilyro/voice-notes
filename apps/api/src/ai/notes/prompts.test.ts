import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompts.js";

describe("systemPrompt", () => {
  it("asks for the notes in the language of the recording", () => {
    expect(systemPrompt("meeting", "en")).toContain("Write all notes in English, the language of the recording.");
    expect(systemPrompt("lesson", "uk")).toContain("Write all notes in Ukrainian, the language of the recording.");
    expect(systemPrompt("memo", "es")).toContain("Write all notes in Spanish, the language of the recording.");
  });

  it("adds the names and terms when given (Task 1.37)", () => {
    expect(systemPrompt("meeting", "en", "Yarema Tkachuk, PTA")).toContain("Spell these names and terms exactly like this: Yarema Tkachuk, PTA");
    expect(systemPrompt("meeting", "en")).not.toContain("Spell these names");
    expect(systemPrompt("meeting", "en", "")).not.toContain("Spell these names");
  });

  it("keeps the mode rule", () => {
    expect(systemPrompt("lesson", "uk")).toContain("reviewQuestions");
  });
});
