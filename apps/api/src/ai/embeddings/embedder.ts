/**
 * Turns text into a vector that captures its meaning (Task 2.1): close vectors = similar meaning, across languages.
 * Lines and questions are embedded differently (e5 wants "passage: " / "query: "), hence two methods.
 */
export interface Embedder {
  readonly name: string;
  readonly dimensions: number;
  embedPassages(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

/** pgvector's text format: "[0.1,0.2,…]" */
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
