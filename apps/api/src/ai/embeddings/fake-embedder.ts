// used in tests and CI, no download: words are hashed into the vector, so texts that share words are close
import type { Embedder } from "./embedder.js";

export class FakeEmbedder implements Embedder {
  readonly name = "fake";
  readonly dimensions = 384;

  private vector(text: string) {
    const v = new Array<number>(this.dimensions).fill(0);
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
      v[h % this.dimensions]! += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }

  async embedPassages(texts: string[]) {
    return texts.map((t) => this.vector(t));
  }

  async embedQuery(text: string) {
    return this.vector(text);
  }
}
