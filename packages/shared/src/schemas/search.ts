import { z } from "zod";
import { Recording } from "./recording.js";

/** `GET /api/search?q=` (Task 1.28) */
export const SearchQuery = z.object({ q: z.string().trim().min(2).max(200) });

/** Snippets mark the matched words with these two characters; the web app turns them into <mark> (never raw HTML). */
export const MARK_START = "⟦";
export const MARK_END = "⟧";

export const SearchMatch = z.object({
  kind: z.enum(["title", "notes", "transcript"]),
  snippet: z.string(),
  startMs: z.number().int().optional(),        // transcript matches: where it was said
});

export const SearchResult = z.object({ recording: Recording, matches: z.array(SearchMatch) });

export type SearchMatch = z.infer<typeof SearchMatch>;
export type SearchResult = z.infer<typeof SearchResult>;
