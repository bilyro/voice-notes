import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { formatDuration } from "../lib/format";
import styles from "./AudioPlayer.module.css";

export type AudioPlayerHandle = {
  /** Jumps to `ms` and starts playing. */
  seek(ms: number): void;
};

type Props = {
  src: string;
  durationMs: number | null;     // fallback until the browser has read the file's length
  onTime?: (ms: number) => void;
  ref?: Ref<AudioPlayerHandle>;
};

const SPEEDS = [1, 1.25, 1.5, 2];

/** Grey capsule: play/pause, current time, seek track, total time, speed. */
export function AudioPlayer({ src, durationMs, onTime, ref }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [lengthMs, setLengthMs] = useState(durationMs ?? 0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    seek(ms) {
      const a = audio.current;
      if (!a) return;
      a.currentTime = ms / 1000;
      setTimeMs(ms);
      onTime?.(ms);
      a.play().catch(() => {});     // a browser may block playing without a click: then it just waits at that moment
    },
  }), [onTime]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  function update() {
    const ms = Math.round((audio.current?.currentTime ?? 0) * 1000);
    setTimeMs(ms);
    onTime?.(ms);
  }

  function readLength() {
    const d = audio.current?.duration;
    if (d && Number.isFinite(d)) setLengthMs(Math.round(d * 1000));
  }

  if (failed) return <p className={styles.error}>The audio could not be loaded. Reload the page to try again.</p>;

  const percent = lengthMs ? Math.min(100, (timeMs / lengthMs) * 100) : 0;
  return (
    <section aria-label="Audio player" className={styles.player}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={update}
        onSeeked={update}
        onLoadedMetadata={readLength}
        onDurationChange={readLength}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        className={styles.play}
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M9 5v14" /><path d="M15 5v14" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
        )}
      </button>
      <span className={`tabular ${styles.time}`}>{formatDuration(timeMs)}</span>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${percent}%` }} />
        <div className={styles.knob} style={{ left: `calc(${percent}% - 7px)` }} />
        {/* the real control: an invisible range input over the track, for mouse, touch and keyboard */}
        <input
          type="range"
          className={styles.range}
          aria-label="Seek"
          aria-valuetext={`${formatDuration(timeMs)} of ${formatDuration(lengthMs)}`}
          min={0}
          max={lengthMs || 1}
          step={1000}
          value={timeMs}
          onChange={(e) => {
            const ms = Number(e.target.value);
            if (audio.current) audio.current.currentTime = ms / 1000;
            setTimeMs(ms);
          }}
        />
      </div>
      <span className={`tabular ${styles.total}`}>{formatDuration(lengthMs)}</span>
      <button
        type="button"
        className={styles.speed}
        aria-label={`Playback speed ${speed}×`}
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
      >
        {speed}×
      </button>
    </section>
  );
}
