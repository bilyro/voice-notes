// PAID stage (Phase 1b)
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Notes, type LanguageCode, type RecordingMode } from "@vn/shared";
import { config } from "../../config.js";
import { ChunkedNotesGenerator } from "./chunked-notes.js";
import { systemPrompt } from "./prompts.js";

export class ClaudeNotes extends ChunkedNotesGenerator {
  readonly name = "claude";
  protected readonly maxCharsPerCall = 60_000;   // big context, no need for small chunks
  protected readonly pauseBetweenCallsMs = 0;
  private client = new Anthropic();              // reads ANTHROPIC_API_KEY

  protected async callModel(mode: RecordingMode, language: LanguageCode, content: string): Promise<Notes> {
    const res = await this.client.messages.create({
      model: config.NOTES_MODEL,
      max_tokens: 8192,                     // notes for a long lecture can exceed 4096 tokens
      system: systemPrompt(mode, language),
      tools: [{
        name: "save_notes",
        description: "Save the structured notes for this recording.",
        input_schema: z.toJSONSchema(Notes) as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: "save_notes" },   // force structured output
      messages: [{ role: "user", content }],
    });
    // a cut-off tool call is invalid JSON: fail clearly instead of a confusing Zod error
    if (res.stop_reason === "max_tokens") throw new Error("Notes were cut off (max_tokens)");
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new Error("Model returned no notes");
    return Notes.parse(block.input);                      // runtime check, retried by BullMQ if invalid
  }
}
