// FREE stage: the same Groq model as the notes
import OpenAI from "openai";
import { z } from "zod";
import { config, GROQ_BASE_URL } from "../../config.js";
import { httpError } from "../../lib/http-error.js";
import { answerPrompt, ModelAnswer, userMessage, type Answerer, type Excerpt } from "./answerer.js";

const answerSchema = z.toJSONSchema(ModelAnswer);
delete answerSchema.$schema;

export class GroqAnswerer implements Answerer {
  readonly name = "groq";
  private client?: OpenAI;

  async answer(question: string, excerpts: Excerpt[]): Promise<ModelAnswer> {
    // made on first use: the API server starts without AI keys, so Ask says it isn't set up instead of crashing
    if (!config.GROQ_API_KEY) throw httpError(503, "Ask isn't set up on this server yet.");
    this.client ??= new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
    const res = await this.client.chat.completions.create({
      model: config.GROQ_NOTES_MODEL,
      // "low" (as for the notes) mixed up excerpts (a piano repair's price for the minibus) and forgot citations;
      // "medium" says "not found" instead, and keeps the question's language. About 2–3 s per question
      reasoning_effort: "medium",
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: answerSchema } },
      messages: [
        { role: "system", content: answerPrompt(new Date().toDateString()) },
        { role: "user", content: userMessage(question, excerpts) },
      ],
    });
    const choice = res.choices[0];
    if (choice?.finish_reason === "length") throw new Error("The answer was cut off (length)");
    return ModelAnswer.parse(JSON.parse(choice?.message.content ?? ""));
  }
}
