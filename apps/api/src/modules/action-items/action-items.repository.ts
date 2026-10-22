import type { Knex } from "knex";
import type { ActionItemEntry, ActionItemStatus, Recording } from "@vn/shared";
import { db } from "../../db.js";
import { httpError } from "../../lib/http-error.js";

type Row = {
  id: string; recording_id: string; text: string; owner: string | null; due_date: string | null; done: boolean;
  title: string; mode: Recording["mode"]; language: Recording["language"]; created_at: Date;
};

const toEntry = (r: Row): ActionItemEntry => ({
  id: r.id, text: r.text, owner: r.owner, dueDate: r.due_date, done: r.done,
  recording: { id: r.recording_id, title: r.title, mode: r.mode, language: r.language, createdAt: r.created_at.toISOString() },
});

/** `action_items` mirrors each recording's latest notes (the notes are the source of truth). */
export class ActionItemsRepository {
  constructor(private db: Knex) {}

  private base(userId: string) {
    return this.db<Row>("action_items as a")
      .join("recordings as r", "r.id", "a.recording_id")
      .where("a.user_id", userId)
      .andWhere("r.user_id", userId)
      .select("a.id", "a.recording_id", "a.text", "a.owner", "a.due_date", "a.done", "r.title", "r.mode", "r.language", "r.created_at");
  }

  /** Newest recording first; within a recording, in the notes' order. */
  async list(userId: string, status: ActionItemStatus) {
    let q = this.base(userId).orderBy([{ column: "r.created_at", order: "desc" }, { column: "a.id", order: "asc" }]);
    if (status !== "all") q = q.where("a.done", status === "done");
    return (await q).map(toEntry);
  }

  /** Someone else's item looks exactly like a missing one: 404. */
  async getOwned(userId: string, id: string) {
    const row = await this.base(userId).where("a.id", id).first();
    if (!row) throw httpError(404, "Action item not found");
    return row;
  }

  /** The item's index in its recording's notes: items are inserted in the notes' order, so it's the count of earlier ids. */
  async indexInRecording(recordingId: string, id: string) {
    const row = await this.db("action_items").where({ recording_id: recordingId }).where("id", "<", id).count<{ n: string }>("id as n").first();
    return Number(row?.n ?? 0);
  }
}

export const actionItemsRepo = new ActionItemsRepository(db);
