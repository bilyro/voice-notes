// The answerer for Ask (Task 2.3): the same provider choice as the notes. It runs in the API server, not the worker,
// so it isn't in providers.ts (that file stops the process when a key is missing; here Ask answers "not set up").
import { config } from "../../config.js";
import type { Answerer } from "./answerer.js";
import { ClaudeAnswerer } from "./claude-answerer.js";
import { GroqAnswerer } from "./groq-answerer.js";

export const answerer: Answerer = config.NOTES_PROVIDER === "claude" ? new ClaudeAnswerer() : new GroqAnswerer();
