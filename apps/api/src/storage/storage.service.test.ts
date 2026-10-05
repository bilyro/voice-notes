import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { keys, storage } from "./storage.service.js";

// integration test: needs the local S3 (docker compose up -d)
async function readAll(stream: Readable) {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

describe("storage", () => {
  it("puts a buffer, reads it back and deletes the prefix", async () => {
    const recId = randomUUID();
    const key = keys.chunk(recId, 0);
    expect(key).toBe(`recordings/${recId}/chunks/00000`);

    const body = Buffer.from("hello storage");
    await storage.put(key, body, "application/octet-stream");
    expect(await readAll(await storage.getStream(key))).toEqual(body);

    const url = await storage.signedUrl(key, 60);
    expect(url).toContain(key);

    await storage.deletePrefix(keys.prefix(recId));
    await expect(storage.getStream(key)).rejects.toThrow();
  });
});
