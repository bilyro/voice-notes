import { httpError } from "../../lib/http-error.js";
import type { RecordingsService } from "../recordings/recordings.service.js";
import type { AccountRepository } from "./account.repository.js";

export class AccountService {
  constructor(private repo: AccountRepository, private recordings: RecordingsService) {}

  /** Everything you put in, as one JSON document (GDPR: a copy of your data). Audio stays on each recording's page. */
  async export(userId: string) {
    const user = await this.repo.user(userId);
    const recs = await this.repo.recordings(userId);
    const ids = recs.map((r) => r.id);
    const [segments, notes] = await Promise.all([this.repo.segments(ids), this.repo.latestNotes(ids)]);
    return {
      exportedAt: new Date().toISOString(),
      account: { email: user.email, name: user.name, createdAt: new Date(user.createdAt).toISOString() },
      recordings: recs.map((r) => {
        const n = notes.find((x) => x.recording_id === r.id);
        return {
          id: r.id, title: r.title, mode: r.mode, language: r.language, status: r.status, source: r.source,
          createdAt: r.created_at.toISOString(), durationMs: r.duration_ms, hasAudio: !!r.audio_key,
          transcript: segments.filter((s) => s.recording_id === r.id).map((s) => ({ startMs: s.start_ms, endMs: s.end_ms, speaker: s.speaker, text: s.text })),
          notes: n ? { version: n.version, editedByUser: n.edited_by_user, content: n.content } : null,
        };
      }),
    };
  }

  /** Deletes every recording (audio first, like a single delete), then the account. `email` must be the account's. */
  async deleteAccount(userId: string, email: string) {
    const user = await this.repo.user(userId);
    if (email.trim().toLowerCase() !== user.email.toLowerCase()) throw httpError(400, "Type your email to confirm.");
    for (const r of await this.repo.recordings(userId)) await this.recordings.delete(userId, r.id);
    await this.repo.deleteUser(user);
  }
}
