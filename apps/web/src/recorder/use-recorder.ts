import { useRef, useState } from "react";

const CHUNK_MS = 10_000;

export function pickMimeType() {
  for (const t of ["audio/webm;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function useRecorder(onChunk: (blob: Blob, index: number) => void) {
  const recRef = useRef<MediaRecorder | null>(null);
  const indexRef = useRef(0);
  const startedAt = useRef(0);
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const rec = new MediaRecorder(stream, { mimeType: pickMimeType(), audioBitsPerSecond: 32_000 });
    indexRef.current = 0;
    rec.ondataavailable = (e) => { if (e.data.size > 0) onChunk(e.data, indexRef.current++); };
    rec.start(CHUNK_MS);                       // emits a chunk every 10 s
    startedAt.current = Date.now();
    recRef.current = rec;
    setState("recording");
  }

  function pause()  { recRef.current?.pause();  setState("paused"); }
  function resume() { recRef.current?.resume(); setState("recording"); }

  /** Resolves after the last chunk has been emitted. Returns approximate duration. */
  function stop(): Promise<number> {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec) return resolve(0);
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        setState("idle");
        resolve(Date.now() - startedAt.current);
      };
      rec.stop();
    });
  }

  return { state, start, pause, resume, stop };
}
