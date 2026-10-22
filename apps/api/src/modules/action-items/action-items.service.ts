import { SavedNotes, type ActionItemStatus } from "@vn/shared";
import { httpError } from "../../lib/http-error.js";
import type { RecordingsRepository } from "../recordings/recordings.repository.js";
import type { ActionItemsRepository } from "./action-items.repository.js";

export class ActionItemsService {
  constructor(private items: ActionItemsRepository, private recordings: RecordingsRepository) {}

  list(userId: string, status: ActionItemStatus) {
    return this.items.list(userId, status);
  }

  /**
   * Ticks (or unticks) one item the same way the detail page does: a new notes version with that item changed,
   * then `action_items` rewritten from it, in one transaction. So both pages always agree.
   */
  async setDone(userId: string, id: string, done: boolean) {
    const item = await this.items.getOwned(userId, id);
    const index = await this.items.indexInRecording(item.recording_id, item.id);
    const latest = await this.recordings.latestNotes(item.recording_id);
    const notes = latest ? SavedNotes.parse(latest.content) : null;
    // the list was loaded from older notes (edited in another tab, say): don't tick the wrong item
    if (!notes || notes.actionItems[index]?.text !== item.text) {
      throw httpError(409, "These notes were changed meanwhile. Reload the page, then try again.");
    }
    const next = { ...notes, actionItems: notes.actionItems.map((a, i) => (i === index ? { ...a, done } : a)) };
    await this.recordings.transaction(async (trx) => {
      await trx.saveNotesVersion(item.recording_id, next, true);
      await trx.replaceActionItems(item.recording_id, userId, next.actionItems);
    });
  }
}
