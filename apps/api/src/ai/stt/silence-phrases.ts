import type { Segment } from "@vn/shared";

/**
 * What Whisper writes when it hears (near) silence: it was trained on subtitles, so quiet audio comes out as the
 * lines that end videos. Groq's `no_speech_prob` is 0 even for pure silence, so we can't rely on it (Task 1.31).
 * Compared after `normalize`, so case and punctuation don't matter.
 */
const PHRASES = [
  // English
  "thank you", "thank you very much", "thanks", "thanks for watching", "thank you for watching", "thank you so much for watching",
  "please subscribe", "bye", "you", "subtitles by the amara org community",
  // Ukrainian
  "дякую", "дякую за увагу", "дякую за перегляд", "дякуємо за перегляд", "до побачення", "субтитри створено спільнотою amara org",
  // Spanish
  "gracias", "muchas gracias", "gracias por ver", "gracias por ver el video", "adiós", "subtítulos realizados por la comunidad de amara org",
];

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const SILENCE = new Set(PHRASES.map(normalize));

/** True when nothing was said: every segment is empty or one of the phrases above. A real sentence is never matched. */
export function onlySilencePhrases(segments: Segment[]) {
  return segments.every((s) => {
    const t = normalize(s.text);
    return t === "" || SILENCE.has(t);
  });
}
