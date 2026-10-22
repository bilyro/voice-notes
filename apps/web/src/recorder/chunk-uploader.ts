import { api, isRefusal } from "../lib/api";

export type UploadState = {
  /** chunks stored without a gap from the start: "Saved up to" = saved × chunk length */
  saved: number;
  /** chunks recorded but not stored yet (queued, uploading or waiting for the connection) */
  pending: number;
  /** the last upload failed for a reason that a retry can fix, so we are waiting for the connection */
  offline: boolean;
};

const MAX_WAIT_MS = 15_000;

/** Resolves after `ms`, as soon as the browser says it is back online, or when `signal` aborts (Cancel). */
function waitOrOnline(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
    signal.addEventListener("abort", done);
  });
}

/**
 * Uploads chunks one by one, in order. Network errors and server hiccups are retried until they
 * work (2, 4, 8 s, then every 15 s, or at once when the browser is back online): the blobs stay in
 * memory meanwhile. Only a chunk the API refuses (4xx) gives up; flush() reports it.
 */
export class ChunkUploader {
  private chain: Promise<void> = Promise.resolve();
  private failed: { blob: Blob; index: number }[] = [];
  private stored = new Set<number>();
  private recordingId: string;
  private onChange?: (state: UploadState) => void;
  private offline = false;
  private cancelled = new AbortController();
  count = 0;

  constructor(recordingId: string, onChange?: (state: UploadState) => void) {
    this.recordingId = recordingId;
    this.onChange = onChange;
  }

  enqueue(blob: Blob, index: number) {
    this.count = Math.max(this.count, index + 1);
    this.chain = this.chain.then(() => this.upload(blob, index));
    this.report();
  }

  private async upload(blob: Blob, index: number) {
    const { signal } = this.cancelled;
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) return;
      try {
        await api(`/recordings/${this.recordingId}/chunks/${index}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
          signal,
        });
        this.stored.add(index);
        this.offline = false;
        return this.report();
      } catch (e) {
        if (signal.aborted) return;                 // cancelled: not a connection problem
        if (isRefusal(e)) {
          // e.g. the recording was deleted elsewhere: retrying can't help; keep the chain alive for the next ones
          this.failed.push({ blob, index });
          return this.report();
        }
        this.offline = true;
        this.report();
        await waitOrOnline(Math.min(1000 * 2 ** attempt, MAX_WAIT_MS), signal);
      }
    }
  }

  private report() {
    let saved = 0;
    while (this.stored.has(saved)) saved++;
    this.onChange?.({ saved, pending: this.count - this.stored.size - this.failed.length, offline: this.offline });
  }

  /** Waits until every queued chunk is stored, however long the connection is gone. */
  async flush() {
    await this.chain;
    if (this.failed.length) throw new Error("Some audio failed to upload");
  }

  /** Stops uploading: aborts the request in flight and every retry. Resolves once nothing is being sent any more. */
  async cancel() {
    this.cancelled.abort();
    await this.chain;
  }

  /** Queues the refused chunks again (the blobs are kept in memory until they upload). */
  retryFailed() {
    const failed = this.failed;
    this.failed = [];
    for (const { blob, index } of failed) this.enqueue(blob, index);
  }
}
