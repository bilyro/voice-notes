import type { Knex } from "knex";
import type { Notes } from "@vn/shared";
import { db } from "../../db.js";
import { httpError } from "../../lib/http-error.js";
import type { RecordingRow } from "../recordings/recordings.repository.js";

type UserRow = { id: string; email: string; name: string; createdAt: Date };

/** Your account and everything in it (Task 1.36). Better Auth's own tables are "user", "session", "account", "verification". */
export class AccountRepository {
  constructor(private db: Knex) {}

  async user(userId: string) {
    const row = await this.db<UserRow>("user").where({ id: userId }).first("id", "email", "name", "createdAt");
    if (!row) throw httpError(404, "Account not found");
    return row;
  }

  recordings(userId: string) {
    return this.db<RecordingRow>("recordings").where({ user_id: userId }).orderBy("created_at", "asc");
  }

  async segments(recordingIds: string[]) {
    if (!recordingIds.length) return [];
    return this.db("transcript_segments").whereIn("recording_id", recordingIds).orderBy([{ column: "recording_id" }, { column: "start_ms" }])
      .select<{ recording_id: string; start_ms: number; end_ms: number; speaker: string | null; text: string }[]>("recording_id", "start_ms", "end_ms", "speaker", "text");
  }

  /** The latest notes version of each recording. */
  async latestNotes(recordingIds: string[]) {
    if (!recordingIds.length) return [];
    return this.db("notes").whereIn("recording_id", recordingIds).distinctOn("recording_id").orderBy([{ column: "recording_id" }, { column: "version", order: "desc" }])
      .select<{ recording_id: string; version: number; edited_by_user: boolean; content: Notes }[]>("recording_id", "version", "edited_by_user", "content");
  }

  /** The account itself, after its recordings are gone: sessions, sign-in methods, verification tokens, the user. */
  deleteUser(user: UserRow) {
    return this.db.transaction(async (trx) => {
      await trx("session").where({ userId: user.id }).delete();
      await trx("account").where({ userId: user.id }).delete();
      await trx("verification").where({ identifier: user.email }).delete();
      await trx("user").where({ id: user.id }).delete();
    });
  }
}

export const accountRepo = new AccountRepository(db);
