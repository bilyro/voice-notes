// Upload an existing audio file (Task 1.27): checked in the browser, then sent in byte chunks like a live recording.
export const UPLOAD_ACCEPT = "audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm,.mp4";
export const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;          // the API takes up to 10 MB per chunk
const MAX_MS = 2 * 60 * 60 * 1000;                          // free speech-to-text: 25 MB per file ≈ 2 h at our 24 kbps
const MAX_BYTES = 1024 * 1024 * 1024;

/** "School trip.m4a" → "School trip" */
export const titleFromFileName = (name: string) => name.replace(/\.[^.]+$/, "").trim().slice(0, 200);

/**
 * The file's length in ms, read from its metadata the way the browser would play it.
 * Rejects with a message for the user when it can't be played or is too long or too big.
 */
export async function checkAudioFile(file: File): Promise<number> {
  if (file.size === 0) throw new Error("This file is empty. Choose another file.");
  if (file.size > MAX_BYTES) throw new Error("This file is larger than 1 GB. Files up to 1 GB can be uploaded.");
  const ms = await readDuration(file).catch(() => {
    throw new Error("This file can't be played as audio. Choose an audio file such as .m4a, .mp3 or .wav.");
  });
  if (ms > MAX_MS) throw new Error(`This file is ${longLength(ms)} long. Files up to 2 hours can be uploaded.`);
  return ms;
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (fn: () => void) => { clearTimeout(timer); URL.revokeObjectURL(url); audio.removeAttribute("src"); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error("timeout"))), 15_000);
    audio.preload = "metadata";
    audio.onerror = () => done(() => reject(new Error("not playable")));
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) return done(() => resolve(Math.round(audio.duration * 1000)));
      // WebM from MediaRecorder has no duration in its header: seeking far ahead makes the browser work it out
      audio.ondurationchange = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) done(() => resolve(Math.round(audio.duration * 1000)));
      };
      audio.currentTime = 1e101;
    };
    audio.src = url;
  });
}

/** "2 h 10 min", "45 min" */
function longLength(ms: number) {
  const min = Math.round(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/** The file as ordered byte chunks; the worker joins them back into the original file. */
export function sliceFile(file: File) {
  const chunks: Blob[] = [];
  for (let start = 0; start < file.size; start += UPLOAD_CHUNK_BYTES) chunks.push(file.slice(start, start + UPLOAD_CHUNK_BYTES));
  return chunks;
}
