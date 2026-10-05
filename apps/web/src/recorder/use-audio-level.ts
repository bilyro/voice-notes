import { useEffect, useState } from "react";

/**
 * Microphone loudness 0–1, sampled every 100 ms: `level` (live meter), `peak` (loudest of the
 * last 1.5 s, so a label doesn't flicker between words) and the last `historyLength` samples
 * for the waveform. Samples taken while `paused` are skipped in the history.
 */
export function useAudioLevel(stream: MediaStream | null, { historyLength = 0, paused = false } = {}) {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const recent: number[] = [];

    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const value = Math.min(1, Math.sqrt(sum / samples.length) * 5);   // normal speech lands around 0.2–0.8
      setLevel(value);
      recent.push(value);
      if (recent.length > 15) recent.shift();
      setPeak(Math.max(...recent));
      if (historyLength && !paused) setHistory((h) => [...h.slice(-(historyLength - 1)), value]);
    }, 100);

    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close();
    };
  }, [stream, historyLength, paused]);

  // a new stream starts a fresh meter and waveform
  const [shownStream, setShownStream] = useState(stream);
  if (stream !== shownStream) {
    setShownStream(stream);
    setLevel(0);
    setPeak(0);
    setHistory([]);
  }

  return { level, peak, history };
}
