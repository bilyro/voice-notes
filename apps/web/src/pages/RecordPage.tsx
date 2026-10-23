import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { LANGUAGE_NAMES, LanguageCode, type RecordingMode } from "@vn/shared";
import { Button } from "../components/Button";
import { InfoNote } from "../components/InfoNote";
import { RecordButton } from "../components/RecordButton";
import { SegmentedControl, type Tone } from "../components/SegmentedControl";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import { ChunkUploader, type UploadState } from "../recorder/chunk-uploader";
import { checkAudioFile, sliceFile, titleFromFileName, UPLOAD_ACCEPT } from "../recorder/file-upload";
import { useAudioLevel } from "../recorder/use-audio-level";
import { CHUNK_MS, MIC_PROCESSING, pickMimeType, TabShareError, useRecorder } from "../recorder/use-recorder";
import { canRecordTab } from "../recorder/mix-audio";
import page from "./Page.module.css";
import styles from "./RecordPage.module.css";

// each mode wears the color of the card it produces most (DESIGN.md: decisions, to-dos, ideas)
const MODES: { value: RecordingMode; label: string; tone: Tone }[] = [
  { value: "meeting", label: "Meeting", tone: "decision" },
  { value: "lesson", label: "Lesson", tone: "todo" },
  { value: "memo", label: "Voice memo", tone: "idea" },
];
const HINTS: Record<RecordingMode, string> = {
  meeting: "Notes will focus on decisions, owners and deadlines.",
  lesson: "Notes will focus on key concepts and review questions.",
  memo: "Notes will focus on ideas and things to do.",
};
const BARS = 40;                       // waveform history, one bar per 100 ms level sample
const JSON_HEADERS = { "Content-Type": "application/json" };
const NO_UPLOADS: UploadState = { saved: 0, pending: 0, offline: false };

// the native name helps people find their language; the UI itself stays English
const LANGUAGES: { value: LanguageCode; label: string }[] = [
  { value: "en", label: "English" },
  { value: "uk", label: "Ukrainian — українська" },
  { value: "es", label: "Spanish — español" },
];
const LANGUAGE_KEY = "vn.recording-language";

// Task 1.34: the microphone alone, or mixed with a shared browser tab (Chrome and Edge on a computer)
type Sound = "mic" | "tab";
const SOUNDS: { value: Sound; label: string }[] = [
  { value: "mic", label: "Microphone" },
  { value: "tab", label: "Mic + browser tab" },
];
const SOUND_HINTS: Record<Sound, string> = {
  mic: "What the microphone hears.",
  tab: "For a video or a call in another tab. The browser asks which tab: tick “Also share tab audio”.",
};
const SOUND_KEY = "vn.recording-sound";
const VOCABULARY_KEY = "vn.recording-vocabulary";   // Task 1.37: names and terms, kept for the next recording
function savedVocabulary() {
  try {
    return localStorage.getItem(VOCABULARY_KEY) ?? "";
  } catch {
    return "";
  }
}
function savedSound(): Sound {
  try {
    return localStorage.getItem(SOUND_KEY) === "tab" ? "tab" : "mic";
  } catch {
    return "mic";
  }
}

/** The last language picked in this browser (a convenience only: storage may be blocked or empty). */
function savedLanguage(): LanguageCode {
  try {
    return LanguageCode.catch("en").parse(localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return "en";
  }
}

const levelLabel = (level: number) => (level < 0.02 ? "No sound" : level < 0.08 ? "Low" : "Good");

export function RecordPage() {
  const navigate = useNavigate();
  const { data: appConfig } = useQuery({ queryKey: ["app-config"], queryFn: () => api<{ freeMode: boolean }>("/app-config") });

  const [mode, setMode] = useState<RecordingMode>("meeting");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<LanguageCode>(savedLanguage);
  const [vocabulary, setVocabulary] = useState(savedVocabulary);
  const [tabSupported] = useState(canRecordTab);
  const [sound, setSound] = useState<Sound>(savedSound);
  const [liveWithTab, setLiveWithTab] = useState(false);
  const [tabEnded, setTabEnded] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const [phase, setPhase] = useState<"setup" | "starting" | "live" | "saving" | "uploading">("setup");
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>(NO_UPLOADS);
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);          // an uploaded file instead of the microphone (Task 1.27)
  const [cancelling, setCancelling] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const idRef = useRef<string | null>(null);
  const uploaderRef = useRef<ChunkUploader | null>(null);
  const durationRef = useRef(0);
  const recorder = useRecorder((blob, index) => uploaderRef.current?.enqueue(blob, index), () => setTabEnded(true));
  const paused = recorder.state === "paused";
  const { level, peak, history: bars } = useAudioLevel(phase === "setup" ? preview : recorder.stream, { historyLength: BARS, paused });

  // before recording: open the chosen microphone so the input level shows it works
  useEffect(() => {
    if (phase !== "setup") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), ...MIC_PROCESSING } })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setPreview(s);
        setMicError(null);
        // device names are only readable after permission is granted
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
      })
      .catch(() => setMicError("No access to the microphone. Allow it for this site in your browser settings, then reload the page."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setPreview(null);
    };
  }, [phase, deviceId]);

  useEffect(() => {
    const refresh = async () =>
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, []);

  // while recording: the timer reads the recorder 4× a second
  const { elapsed: readElapsed } = recorder;
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => setElapsed(readElapsed()), 250);
    return () => clearInterval(id);
  }, [phase, readElapsed]);

  // closing the tab mid-recording would lose the audio that is not uploaded yet
  useEffect(() => {
    if (phase === "setup") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  async function startRecording() {
    setError(null);
    setPhase("starting");
    setTabEnded(false);
    const withTab = tabSupported && sound === "tab";
    // the sound sources open first (the browser shows its tab picker only right after the click), then the recording is created
    const at: { stage: "sound" | "create" | "record" } = { stage: "sound" };   // an object: the callback below moves it on
    try {
      await recorder.start(deviceId || undefined, {
        tab: withTab,
        beforeStart: async () => {
          at.stage = "create";
          const { id } = await api<{ id: string }>("/recordings", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ mode, title: title.trim() || undefined, language, vocabulary: vocabulary.trim() || undefined, mimeType: pickMimeType() || "audio/webm", source: "web" }),
          });
          idRef.current = id;
          uploaderRef.current = new ChunkUploader(id, setUpload);
          setUpload(NO_UPLOADS);
          setElapsed(0);
          at.stage = "record";
        },
      });
      setLiveWithTab(withTab);
      setPhase("live");
    } catch (e) {
      if (at.stage === "record" && idRef.current) api(`/recordings/${idRef.current}`, { method: "DELETE" }).catch(() => {});   // don't leave an empty recording behind
      setError(e instanceof TabShareError ? e.message
        : at.stage === "create" ? "The recording could not be created. Check your connection, then try again."
        : "The microphone could not start. Check that it is connected and allowed for this site, then try again.");
      setPhase("setup");
    }
  }

  async function stopAndSave() {
    setPhase("saving");
    durationRef.current = await recorder.stop();
    setElapsed(durationRef.current);
    await save();
  }

  /** Upload an existing file: checked here first, then the same chunks, retries and finish as a live recording. */
  async function uploadFile(chosen: File) {
    setError(null);
    setPhase("starting");
    let durationMs: number;
    try {
      durationMs = await checkAudioFile(chosen);
    } catch (e) {
      setPhase("setup");
      return setError((e as Error).message);
    }
    let id: string;
    try {
      ({ id } = await api<{ id: string }>("/recordings", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          mode, language, source: "upload", vocabulary: vocabulary.trim() || undefined,
          title: title.trim() || titleFromFileName(chosen.name) || undefined,
          mimeType: chosen.type || "application/octet-stream",
        }),
      }));
    } catch {
      setPhase("setup");
      return setError("The recording could not be created. Check your connection, then try again.");
    }
    const uploader = new ChunkUploader(id, setUpload);
    idRef.current = id;
    uploaderRef.current = uploader;
    durationRef.current = durationMs;
    setUpload(NO_UPLOADS);
    setFile(chosen);
    setPhase("uploading");
    sliceFile(chosen).forEach((blob, i) => uploader.enqueue(blob, i));
    await save();
  }

  async function cancelUpload() {
    const uploader = uploaderRef.current;
    uploaderRef.current = null;                 // save() sees this and won't finish the recording
    setCancelling(true);
    await uploader?.cancel();
    await api(`/recordings/${idRef.current}`, { method: "DELETE" }).catch(() => {});
    setCancelling(false);
    setFile(null);
    setError(null);
    setPhase("setup");
  }

  async function save() {
    setError(null);
    const id = idRef.current!;
    const uploader = uploaderRef.current!;
    try {
      await uploader.flush();
    } catch {
      if (uploaderRef.current !== uploader) return;   // cancelled meanwhile
      return setError("Some audio could not be uploaded. Check your connection, then try again.");
    }
    if (uploaderRef.current !== uploader) return;     // the upload was cancelled
    if (uploader.count === 0) {
      api(`/recordings/${id}`, { method: "DELETE" }).catch(() => {});
      setPhase("setup");
      return setError("Nothing was recorded. Try again.");
    }
    try {
      await api(`/recordings/${id}/finish`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ chunkCount: uploader.count, durationMs: Math.round(durationRef.current) }),
      });
      navigate(`/recordings/${id}`, { replace: true });
    } catch (e) {
      // fetch throws TypeError when the network is down; otherwise the API said why (e.g. the monthly limit)
      setError(e instanceof TypeError || !(e instanceof Error)
        ? "The recording could not be saved. Check your connection, then try again."
        : e.message);
    }
  }

  function tryAgain() {
    uploaderRef.current?.retryFailed();
    void save();
  }

  if (phase === "setup" || phase === "starting") {
    return (
      <div className={`${page.page} ${page.form}`}>
        <h1>New recording</h1>

        {appConfig?.freeMode && (
          <div className={styles.note}>
            <InfoNote>Free plan: recordings are processed by a free service with no privacy guarantee. Record only your own voice for testing.</InfoNote>
          </div>
        )}

        <div className={styles.modes}>
          <SegmentedControl legend="What are you recording?" name="mode" options={MODES} value={mode} onChange={setMode} hint={HINTS[mode]} />
        </div>

        <div className={styles.field}>
          <label htmlFor="title" className={styles.label}>
            Title <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="title"
            className={styles.input}
            value={title}
            maxLength={200}
            placeholder="For example: Science fair planning"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="language" className={styles.label}>Language</label>
          <select
            id="language"
            className={styles.input}
            value={language}
            aria-describedby="language-hint"
            onChange={(e) => {
              const value = LanguageCode.parse(e.target.value);
              setLanguage(value);
              try { localStorage.setItem(LANGUAGE_KEY, value); } catch { /* private window: just not remembered */ }
            }}
          >
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <p id="language-hint" className={styles.hint}>The language people speak in the recording. The transcript and notes use it too.</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="vocabulary" className={styles.label}>
            Names and terms <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="vocabulary"
            className={styles.input}
            value={vocabulary}
            maxLength={300}
            placeholder="For example: Olena, Riverside School, PTA"
            aria-describedby="vocabulary-hint"
            onChange={(e) => {
              setVocabulary(e.target.value);
              try { localStorage.setItem(VOCABULARY_KEY, e.target.value); } catch { /* private window: just not remembered */ }
            }}
          />
          <p id="vocabulary-hint" className={styles.hint}>Names, places or words that come up. They help the transcript and the notes spell them right.</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="mic" className={styles.label}>Microphone</label>
          <select id="mic" className={styles.input} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.length === 0 && <option value="">Default microphone</option>}
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId === "default" ? "" : d.deviceId}>
                {d.label || "Microphone"}
              </option>
            ))}
          </select>
          {micError ? (
            <p className={styles.error} role="alert">{micError}</p>
          ) : (
            <div className={styles.level}>
              <span>Input level</span>
              <span className={styles.meter} aria-hidden="true">
                <span className={styles.meterFill} style={{ width: `${Math.round(level * 100)}%` }} />
              </span>
              <span className={styles.levelLabel}>{levelLabel(peak)}</span>
            </div>
          )}
          <p className={styles.hint}>Recording a video or a call on this computer? Play it through the speakers: headphones keep the sound away from the microphone.</p>
        </div>

        {tabSupported && (
          <div className={styles.modes}>
            <SegmentedControl
              legend="Sound"
              name="sound"
              wide
              options={SOUNDS}
              value={sound}
              hint={SOUND_HINTS[sound]}
              onChange={(v) => {
                setSound(v);
                try { localStorage.setItem(SOUND_KEY, v); } catch { /* private window: just not remembered */ }
              }}
            />
          </div>
        )}

        <div className={styles.start}>
          <RecordButton action="start" label="Start recording" onClick={startRecording} disabled={phase === "starting" || !!micError} />
          <p className={styles.consent}>Tell everyone they are being recorded. Audio is saved every 10 seconds.</p>
          <div className={styles.upload}>
            <span className={styles.or} aria-hidden="true">or</span>
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={phase === "starting"} aria-describedby="upload-hint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M5 21h14" /></svg>
              Upload an audio file
            </Button>
            <p id="upload-hint" className={styles.consent}>A voice memo or a meeting export (.m4a, .mp3, .wav, .mp4…), up to 2 hours.</p>
            <input
              ref={fileInput}
              type="file"
              accept={UPLOAD_ACCEPT}
              hidden
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                e.target.value = "";            // choosing the same file again still fires onChange
                if (chosen) void uploadFile(chosen);
              }}
            />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  if (phase === "uploading" && file) {
    const total = Math.max(1, uploaderRef.current?.count ?? 1);
    const percent = Math.floor((upload.saved / total) * 100);
    return (
      <div className={`${page.page} ${page.form}`}>
        <h1>Uploading</h1>
        <div className={styles.start}>
          <p className={styles.fileName}>{file.name}</p>
          <p className={styles.consent}>
            <span className="tabular">{formatDuration(durationRef.current)}</span> · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
          <span className={styles.progress} role="progressbar" aria-label="Upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span className={styles.progressFill} style={{ width: `${percent}%` }} />
          </span>
          {!error && (
            <p className={`${styles.consent} ${upload.offline ? styles.offlineNow : ""}`} role="status">
              {upload.offline
                ? "No connection. The upload continues when you are back online. Keep this page open."
                : percent < 100 ? `Uploading… ${percent}%` : "Saving…"}
            </p>
          )}
          {error && (
            <>
              <p className={styles.error} role="alert">{error}</p>
              <Button variant="secondary" onClick={tryAgain}>Try again</Button>
            </>
          )}
          <Button variant="secondary" onClick={cancelUpload} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel upload"}</Button>
        </div>
      </div>
    );
  }

  const saved = Math.min(upload.saved * CHUNK_MS, elapsed);
  const unsaved = formatDuration(Math.max(0, elapsed - saved));   // audio that only lives in this tab for now

  return (
    <div className={`${page.page} ${page.form} ${styles.live}`}>
      <div className={styles.liveTop}>
        <span className={styles.chips}>
          <span className={styles.chip}>{MODES.find((m) => m.value === mode)!.label}</span>
          {language !== "en" && <span className={styles.chip}>{LANGUAGE_NAMES[language]}</span>}
          {liveWithTab && <span className={styles.chip}>{tabEnded ? "Mic only" : "Mic + tab"}</span>}
        </span>
        {phase === "live" && !paused && (
          <span className={styles.badge}>
            <span className={styles.liveDot} aria-hidden="true" />
            Recording
          </span>
        )}
        {phase === "live" && paused && <span className={styles.chip}>Paused</span>}
      </div>
      <h1 className={styles.liveTitle}>{title.trim() || "Untitled recording"}</h1>

      <div className={styles.center}>
        <span className={`tabular ${styles.timer}`} role="timer">{formatDuration(elapsed)}</span>
        <div className={styles.wave} aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => {
            const v = bars[i];
            if (v === undefined) return <span key={i} className={`${styles.bar} ${styles.barEmpty}`} />;
            const recent = i >= bars.length - 6;
            return <span key={i} className={`${styles.bar} ${recent ? styles.barNow : styles.barPast}`} style={{ height: `${6 + Math.round(v * 58)}px` }} />;
          })}
        </div>
        <span className={styles.saved}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
          <span>Saved up to <span className={`tabular ${styles.ink}`}>{formatDuration(saved)}</span></span>
        </span>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.pause} onClick={paused ? recorder.resume : recorder.pause} disabled={phase !== "live"}>
          <span className={styles.pauseCircle} aria-hidden="true">
            {paused ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 5v14" /><path d="M15 5v14" /></svg>
            )}
          </span>
          {paused ? "Resume" : "Pause"}
        </button>
        <RecordButton action="stop" label="Stop and save" onClick={stopAndSave} disabled={phase !== "live"} />
      </div>

      {phase === "saving" && !error && (
        <p className={`${styles.status} ${upload.offline ? styles.offlineNow : ""}`} role="status">
          {upload.offline ? `Saving… waiting for the connection to upload the last ${unsaved}. Keep this page open.` : "Saving…"}
        </p>
      )}
      {error && (
        <div className={styles.saveError}>
          <p className={styles.error} role="alert">{error}</p>
          <Button variant="secondary" onClick={tryAgain}>Try again</Button>
        </div>
      )}
      {phase === "live" && (
        <p className={`${styles.offline} ${upload.offline || tabEnded ? styles.offlineNow : ""}`} role="status">
          {upload.offline
            ? `No connection. Keep recording: the last ${unsaved} is kept here and uploads when you are back online.`
            : tabEnded ? "The tab stopped sharing. Recording the microphone only."
            : "Lost connection? Keep recording. Audio uploads when you are back online."}
        </p>
      )}
    </div>
  );
}
