// used in tests, no network
import type { SpeechToText } from "./speech-to-text.js";

export class FakeStt implements SpeechToText {
  readonly name = "fake";
  async transcribe() {
    return { segments: [
      { startMs: 0, endMs: 4000, speaker: null, text: "Today we are going over the lesson plan." },
      { startMs: 4000, endMs: 9000, speaker: null, text: "Olena will prepare the quiz by Friday." },
    ] };
  }
}
