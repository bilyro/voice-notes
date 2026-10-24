// The embedder for the worker (Task 2.1) and the API (search, Task 2.2). No API key needed, so not in providers.ts.
import { config } from "../../config.js";
import type { Embedder } from "./embedder.js";
import { FakeEmbedder } from "./fake-embedder.js";
import { LocalE5Embedder } from "./local-e5.js";

export const embedder: Embedder = config.EMBEDDINGS_PROVIDER === "fake" ? new FakeEmbedder() : new LocalE5Embedder();
