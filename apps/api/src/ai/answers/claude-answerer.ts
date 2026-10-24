// PAID stage (Phase 1b): the same Claude model as the notes
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../../config.js";
import { httpError } from "../../lib/http-error.js";
import { answerPrompt, ModelAnswer, userMessage, type Answerer, type Excerpt } from "./answerer.js";

export class ClaudeAnswerer implements Answerer {
  readonly name = "claude";
  private client?: Anthropic;

  async answer(question: string, excerpts: Excerpt[]): Promise<ModelAnswer> {
    if (!config.ANTHROPIC_API_KEY) throw httpError(503, "Ask isn't set up on this server yet.");
    this.client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    const res = await this.client.messages.create({
      model: config.NOTES_MODEL,
      max_tokens: 1024,
      system: answerPrompt(new Date().toDateString()),
      tools: [{
        name: "give_answer",
        description: "Give the answer to the user's question.",
        input_schema: z.toJSONSchema(ModelAnswer) as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: "give_answer" },
      messages: [{ role: "user", content: userMessage(question, excerpts) }],
    });
    if (res.stop_reason === "max_tokens") throw new Error("The answer was cut off (max_tokens)");
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new Error("Model returned no answer");
    return ModelAnswer.parse(block.input);
  }
}
