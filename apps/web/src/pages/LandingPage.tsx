import { useState } from "react";
import { Link } from "react-router";
import { ButtonLink } from "../components/Button";
import { InfoNote } from "../components/InfoNote";
import styles from "./LandingPage.module.css";

const STEPS = [
  {
    title: "1. Record",
    text: "Pick meeting, lesson or memo and press the red button. Audio is saved every 10 seconds, so a dropped connection loses nothing.",
    icon: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>,
  },
  {
    title: "2. Read the transcript",
    text: "Every sentence with its timestamp. Click a line and the audio plays from that moment.",
    icon: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></>,
  },
  {
    title: "3. Use the notes",
    text: "Summary, decisions and action items appear on their own. Edit them, tick items off, or copy them as Markdown.",
    icon: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12l3 3 5-6" /></>,
  },
];

const MODES = [
  { label: "Meeting", items: ["Summary and key points", "Decisions with timestamps", "Action items with owner and date", "Open questions"] },
  { label: "Lesson", items: ["Summary of the lesson", "Key concepts, explained simply", "Review questions to check yourself"] },
  { label: "Voice memo", items: ["Your idea, cleaned up", "Ideas grouped and listed", "Next steps you mentioned"] },
];

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerRow}`}>
          <Link to="/" className={styles.logo}>
            <span className={styles.dot} aria-hidden="true" />
            Voice notes
          </Link>
          <nav aria-label="Account" className={styles.headerNav}>
            <Link to="/login" className={styles.textButton}>Sign in</Link>
            <ButtonLink to="/signup">Create account</ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-title" className={`${styles.wrap} ${styles.hero}`}>
          <div className={styles.heroText}>
            <span className={styles.badge}>
              <span className={styles.smallDot} aria-hidden="true" />
              Meetings, lessons and voice memos
            </span>
            <h1 id="hero-title" className={styles.heroTitle}>Record the conversation. Get the notes.</h1>
            <p className={styles.lead}>
              Press record in your browser. When you stop, you get the full transcript, a short summary, the decisions, and the action
              items with who owns them.
            </p>
            <div className={styles.ctaRow}>
              <ButtonLink to="/signup" className={styles.bigButton}>
                <span className={styles.dotOnDark} aria-hidden="true" />
                Start recording for free
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" className={styles.bigButton}>I have an account</ButtonLink>
            </div>
            <p className={styles.small}>Works in your browser, on a laptop or a phone. English only for now.</p>
          </div>
          <ExampleNotes />
        </section>

        <section aria-labelledby="how-title" className={styles.band}>
          <div className={styles.wrap}>
            <h2 id="how-title" className={styles.sectionTitle}>How it works</h2>
            <ol className={styles.steps}>
              {STEPS.map((s) => (
                <li key={s.title} className={styles.step}>
                  <span className={styles.tile} aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                  </span>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.soft}>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="modes-title" className={styles.band}>
          <div className={styles.wrap}>
            <h2 id="modes-title" className={styles.sectionTitle}>Notes that fit what you recorded</h2>
            <div className={styles.modes}>
              {MODES.map((m) => (
                <article key={m.label} className={styles.mode} aria-label={m.label}>
                  <span className={styles.chip}>{m.label}</span>
                  <ul className={styles.modeList}>
                    {m.items.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <div className={styles.suggestion}>
              <h3 className={styles.suggestionTitle}>Suggested next steps</h3>
              <p className={styles.suggestionLine}>Ideas from the assistant. Nobody said these in the meeting.</p>
              <p className={styles.soft}>
                Suggestions always sit in this grey box, apart from what people actually said, so you never mix up a fact with a guess.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="plan-title" className={styles.band}>
          <div className={`${styles.wrap} ${styles.plan}`}>
            <div className={styles.planText}>
              <h2 id="plan-title" className={styles.sectionTitle}>Free while we test it</h2>
              <p className={styles.lead}>
                Recording minutes have a monthly limit. Delete a recording at any time and its audio, transcript and notes are gone for good.
              </p>
            </div>
            <div className={styles.planNote}>
              <InfoNote>
                Free plan: recordings are processed by a free service with no privacy guarantee. Use it for test recordings, not for anything
                confidential.
              </InfoNote>
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-title" className={styles.band}>
          <div className={`${styles.wrap} ${styles.finalCta}`}>
            <span className={styles.recordButton} aria-hidden="true"><span /></span>
            <h2 id="cta-title" className={styles.sectionTitle}>Your next meeting writes its own notes</h2>
            <ButtonLink to="/signup" className={styles.bigButton}>Create a free account</ButtonLink>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerRow}`}>
          <span className={styles.footerLogo}>
            <span className={styles.smallDot} aria-hidden="true" />
            Voice notes
          </span>
          <span>English only for now</span>
        </div>
      </footer>
    </div>
  );
}

/** A sample of real output: the same pieces the detail page shows (player, summary, decision with timestamp, action items). */
function ExampleNotes() {
  const [done, setDone] = useState([true, false]);
  const items = [
    { text: "Book the gym for March 14", meta: "Dana, by Monday" },
    { text: "Send the parent newsletter", meta: "Sam, by Friday" },
  ];
  return (
    <figure className={styles.example} aria-label="Example notes from a recording">
      <div className={styles.player} aria-hidden="true">
        <span className={styles.play}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>
        </span>
        <span className="tabular">12:04</span>
        <span className={styles.track}><span className={styles.fill} /></span>
        <span className={`tabular ${styles.mutedText}`}>31:40</span>
      </div>
      <p className={styles.exampleMeta}>Staff meeting · Meeting · 31 min</p>
      <p className={styles.exampleSummary}>
        The team agreed to move the science fair to the gym and split setup between two classes. Parents get the newsletter on Friday.
      </p>
      <h3 className={styles.exampleHeading}>Decisions</h3>
      <p className={styles.decision}>
        <span>Science fair moves to the gym.</span>
        <span className={`tabular ${styles.mutedText}`}>4:12</span>
      </p>
      <h3 className={styles.exampleHeading}>Action items</h3>
      <ul className={styles.actionItems}>
        {items.map((item, i) => (
          <li key={item.text}>
            <label className={styles.actionItem}>
              <input type="checkbox" checked={done[i]} onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} />
              <span>
                <span className={done[i] ? styles.done : undefined}>{item.text}</span>
                <span className={styles.itemMeta}>{item.meta}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </figure>
  );
}
