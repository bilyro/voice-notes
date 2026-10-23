import { useCallback, useRef, useState } from "react";
import { mixAudio } from "./mix-audio";

export const CHUNK_MS = 10_000;

/**
 * How the microphone is opened, for the level preview and the recording alike. Echo cancellation and noise
 * suppression are made for calls: they remove what this computer plays (a video, the other people in a call) and any
 * sound that isn't speech. A recorder should hear the whole room, speakers included (Task 1.31).
 */
export const MIC_PROCESSING = { echoCancellation: false, noiseSuppression: false, autoGainControl: true } as const;

/** Starting with a tab failed for a reason the user can fix; `message` says how. */
export class TabShareError extends Error {}

export function pickMimeType() {
  for (const t of ["audio/webm;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function useRecorder(onChunk: (blob: Blob, index: number) => void, onTabEnded?: () => void) {
  const recRef = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<() => void>(() => {});      // stops the microphone, the shared tab and the mixer
  const indexRef = useRef(0);
  const startedAt = useRef(0);
  const pausedAt = useRef(0);       // 0 while not paused
  const pausedTotal = useRef(0);
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);

  /**
   * `deviceId` picks the microphone (omitted = the browser's default). With `tab`, the browser first asks which tab to
   * share, and its sound is mixed with the microphone (Task 1.34). `beforeStart` runs once the sound sources are open
   * and before recording begins (the page creates the recording there): the browser only shows its tab picker right
   * after a click, so that has to come first. If `beforeStart` throws, everything is closed again.
   */
  async function start(deviceId?: string, { tab = false, beforeStart }: { tab?: boolean; beforeStart?: () => Promise<void> } = {}) {
    let display: MediaStream | null = null;
    if (tab) {
      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });   // video is needed to pick a tab
      } catch {
        throw new TabShareError("No tab was shared. Start again and pick a tab, or choose “Microphone”.");
      }
      display.getVideoTracks().forEach((t) => t.stop());                                       // only the sound is kept
      if (display.getAudioTracks().length === 0) {
        display.getTracks().forEach((t) => t.stop());
        throw new TabShareError("That tab's sound wasn't shared. Start again and tick “Also share tab audio”.");
      }
    }
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, ...MIC_PROCESSING },
      });
    } catch (e) {
      display?.getTracks().forEach((t) => t.stop());
      throw e;
    }
    let stream = mic;
    cleanup.current = () => mic.getTracks().forEach((t) => t.stop());
    if (display) {
      const tabStream = display;
      const mixer = mixAudio([mic, tabStream]);
      stream = mixer.stream;
      // "Stop sharing" in the browser ends the tab's track: the mix goes on with the microphone
      tabStream.getAudioTracks()[0]!.addEventListener("ended", () => onTabEnded?.());
      cleanup.current = () => {
        mic.getTracks().forEach((t) => t.stop());
        tabStream.getTracks().forEach((t) => t.stop());
        mixer.close();
      };
    }
    try {
      await beforeStart?.();
    } catch (e) {
      cleanup.current();
      throw e;
    }
    const rec = new MediaRecorder(stream, { mimeType: pickMimeType(), audioBitsPerSecond: 32_000 });
    indexRef.current = 0;
    rec.ondataavailable = (e) => { if (e.data.size > 0) onChunk(e.data, indexRef.current++); };
    rec.start(CHUNK_MS);                       // emits a chunk every 10 s
    startedAt.current = Date.now();
    pausedAt.current = 0;
    pausedTotal.current = 0;
    recRef.current = rec;
    setStream(stream);
    setState("recording");
  }

  function pause() {
    recRef.current?.pause();
    pausedAt.current = Date.now();
    setState("paused");
  }

  function resume() {
    recRef.current?.resume();
    pausedTotal.current += Date.now() - pausedAt.current;
    pausedAt.current = 0;
    setState("recording");
  }

  /** Recorded time so far, without paused time. Stable across renders (reads refs only), so effects can depend on it. */
  const elapsed = useCallback(() => {
    if (!startedAt.current) return 0;
    return (pausedAt.current || Date.now()) - startedAt.current - pausedTotal.current;
  }, []);

  /** Resolves after the last chunk has been emitted. Returns the duration without pauses. */
  function stop(): Promise<number> {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec) return resolve(0);
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        cleanup.current();
        const duration = elapsed();
        recRef.current = null;
        setStream(null);
        setState("idle");
        resolve(duration);
      };
      rec.stop();
    });
  }

  return { state, stream, start, pause, resume, stop, elapsed };
}
