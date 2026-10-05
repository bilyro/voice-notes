import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { config } from "../config.js";

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: true,                        // needed for RustFS/MinIO, also works with R2
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
});

export const storage = {
  put: (key: string, body: Buffer, contentType: string) =>
    s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: contentType })),

  async getStream(key: string): Promise<Readable> {
    const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return res.Body as Readable;
  },

  signedUrl: (key: string, seconds = 3600) =>
    getSignedUrl(s3, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), { expiresIn: seconds }),

  async deletePrefix(prefix: string) {
    // one list call returns at most 1000 keys (~2.7 h of 10 s chunks), so page through
    let token: string | undefined;
    do {
      const list = await s3.send(new ListObjectsV2Command({ Bucket: config.S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length) await s3.send(new DeleteObjectsCommand({ Bucket: config.S3_BUCKET, Delete: { Objects: objects } }));
      token = list.NextContinuationToken;
    } while (token);
  },
};

export const keys = {
  chunk: (recId: string, i: number) => `recordings/${recId}/chunks/${String(i).padStart(5, "0")}`,
  audio: (recId: string) => `recordings/${recId}/audio.ogg`,
  prefix: (recId: string) => `recordings/${recId}/`,
};
