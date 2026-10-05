// FREE stage
import OpenAI from "openai";
import { z } from "zod";
import { Notes, type RecordingMode } from "@vn/shared";
import { config, GROQ_BASE_URL } from "../../config.js";
import { ChunkedNotesGenerator } from "./chunked-notes.js";
import { systemPrompt } from "./prompts.js";

// strict mode makes Groq generate JSON that always matches this schema (only the schema itself is sent, without the "$schema" meta key)
const notesSchema = z.toJSONSchema(Notes);
delete notesSchema.$schema;

export class GroqNotes extends ChunkedNotesGenerator {
  readonly name = "groq";
  protected readonly maxCharsPerCall = config.GROQ_NOTES_MAX_CHARS;  // ≈ 4k tokens per call
  protected readonly pauseBetweenCallsMs = 60_000;                   // free tier: low tokens/minute
  private client = new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: GROQ_BASE_URL });

  protected async callModel(mode: RecordingMode, content: string): Promise<Notes> {
    const res = await this.client.chat.completions.create({
      model: config.GROQ_NOTES_MODEL,
      // gpt-oss "thinks" before answering and those tokens count as output; on the free tier
      // (8k tokens/minute) the default effort made long merge calls run out before the JSON was done
      reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: { name: "notes", strict: true, schema: notesSchema } },
      messages: [
        { role: "system", content: systemPrompt(mode) },
        { role: "user", content },
      ],
    });
    const choice = res.choices[0];
    // a cut-off answer is invalid JSON: fail clearly instead of a confusing parse error
    if (choice?.finish_reason === "length") throw new Error("Notes were cut off (length)");
    return Notes.parse(JSON.parse(choice?.message.content ?? ""));   // still checked at runtime; invalid → BullMQ retries
  }
}
