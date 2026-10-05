import { api } from "../lib/api";

/** Uploads chunks one by one, in order, with retries. */
export class ChunkUploader {
  private chain: Promise<void> = Promise.resolve();
  private failed: { blob: Blob; index: number }[] = [];
  private recordingId: string;
  private onUploaded?: (uploaded: number) => void;
  count = 0;
  uploaded = 0;

  /** `onUploaded` gets the number of chunks stored so far (for "Saved up to"). */
  constructor(recordingId: string, onUploaded?: (uploaded: number) => void) {
    this.recordingId = recordingId;
    this.onUploaded = onUploaded;
  }

  enqueue(blob: Blob, index: number) {
    this.count = Math.max(this.count, index + 1);
    this.chain = this.chain.then(() => this.upload(blob, index));
  }

  private async upload(blob: Blob, index: number, attempt = 1): Promise<void> {
    try {
      await api(`/recordings/${this.recordingId}/chunks/${index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });
      this.onUploaded?.(++this.uploaded);
    } catch {
      // give up on this chunk but keep the chain alive for the next ones; flush() reports it
      if (attempt >= 5) { this.failed.push({ blob, index }); return; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return this.upload(blob, index, attempt + 1);
    }
  }

  async flush() {
    await this.chain;
    if (this.failed.length) throw new Error("Some audio failed to upload");
  }

  /** Queues the chunks that gave up again (the blobs are kept in memory until they upload). */
  retryFailed() {
    const failed = this.failed;
    this.failed = [];
    for (const { blob, index } of failed) this.enqueue(blob, index);
  }
}
