// FREE, runs here: multilingual-e5-small (ONNX, ~120 MB, downloaded once into MODEL_CACHE_DIR), 384 numbers per text
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { config } from "../../config.js";
import type { Embedder } from "./embedder.js";

export class LocalE5Embedder implements Embedder {
  readonly name = "local-multilingual-e5-small";
  readonly dimensions = 384;
  private extractor: Promise<FeatureExtractionPipeline> | null = null;

  /** Loaded on first use (a few seconds), then kept in memory. */
  private load() {
    this.extractor ??= (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = config.MODEL_CACHE_DIR;
      return pipeline("feature-extraction", config.EMBEDDINGS_MODEL, { dtype: "q8" });
    })();
    return this.extractor;
  }

  private async embed(texts: string[]) {
    const out = await (await this.load())(texts, { pooling: "mean", normalize: true });
    return out.tolist() as number[][];
  }

  embedPassages(texts: string[]) {
    return this.embed(texts.map((t) => `passage: ${t}`));
  }

  async embedQuery(text: string) {
    return (await this.embed([`query: ${text}`]))[0]!;
  }
}
