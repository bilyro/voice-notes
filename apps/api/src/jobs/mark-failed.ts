import { repo } from "../modules/recordings/recordings.repository.js";

export const markFailed = (recordingId: string, error: string) =>
  repo.update(recordingId, { status: "failed", error });
