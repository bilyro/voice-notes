import { useState } from "react";
import { Link } from "react-router";
import { ButtonLink } from "../components/Button";
import { InfoNote } from "../components/InfoNote";
import { LogoMark } from "../components/LogoMark";
import styles from "./LandingPage.module.css";

const STEPS = [
  { title: "1. Record", text: "Pick meeting, lesson or memo and press the red button. Audio is saved every 10 seconds, so a dropped connection loses nothing." },
  { title: "2. Read the transcript", text: "Every sentence with its timestamp. Click a line and the audio plays from that moment." },
  { title: "3. Use the notes", text: "Summary, decisions and action items appear on their own. Edit them, tick items off, or copy them as Markdown." },
];

const MODES = [
  { label: "Meeting", tone: styles.toneDecision, items: ["Summary and key points", "Decisions with timestamps", "Action items with owner and date", "Open questions"] },
  { label: "Lesson", tone: styles.toneTodo, items: ["Summary of the lesson", "Key concepts, explained simply", "Review questions to check yourself"] },
  { label: "Voice memo", tone: styles.toneIdea, items: ["Your idea, cleaned up", "Ideas grouped and listed", "Next steps you mentioned"] },
];

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={`${styles.wrap} ${styles.header}`}>
        <Link to="/" className={styles.logo}>
          <LogoMark />
          Voice notes
        </Link>
        <nav aria-label="Account" className={styles.headerNav}>
          <Link to="/login" className={styles.textButton}>Sign in</Link>
          <ButtonLink to="/signup">Create account</ButtonLink>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-title" className={`${styles.wrap} ${styles.hero}`}>
          <p className={`pencil ${styles.heroPencil}`} aria-hidden="true">one meeting, sorted:</p>
          <h1 id="hero-title" className={styles.heroTitle}>Talk it through. Get it on cards.</h1>
          <p className={styles.lead}>
            Record in your browser. The summary, the decisions and every to-do land on their own card, each one linked back to the
            moment it was said.
          </p>
          <div className={styles.ctaRow}>
            <ButtonLink to="/signup" className={styles.bigButton}>
              <span className={styles.dotOnDark} aria-hidden="true" />
              Start recording for free
            </ButtonLink>
            <ButtonLink to="/login" variant="secondary" className={styles.bigButton}>I have an account</ButtonLink>
          </div>
          <p className={styles.small}>Works in your browser, on a laptop or a phone. English only for now.</p>
        </section>

        <ExampleCards />

        <section aria-labelledby="how-title" className={`${styles.wrap} ${styles.section}`}>
          <h2 id="how-title" className={styles.sectionTitle}>How it works</h2>
          <ol className={styles.steps}>
            {STEPS.map((s) => (
              <li key={s.title} className={styles.stepCard}>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.soft}>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="modes-title" className={`${styles.wrap} ${styles.section}`}>
          <h2 id="modes-title" className={styles.sectionTitle}>Notes that fit what you recorded</h2>
          <div className={styles.modes}>
            {MODES.map((m) => (
              <article key={m.label} className={`${styles.modeCard} ${m.tone}`} aria-label={m.label}>
                <h3 className={styles.modeTitle}>{m.label}</h3>
                <ul className={styles.modeList}>
                  {m.items.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="plan-title" className={`${styles.wrap} ${styles.section} ${styles.plan}`}>
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
        </section>

        <section aria-labelledby="cta-title" className={`${styles.wrap} ${styles.finalCta}`}>
          <span className={styles.recordButton} aria-hidden="true"><span /></span>
          <h2 id="cta-title" className={styles.sectionTitle}>Your next meeting writes its own cards</h2>
          <ButtonLink to="/signup" className={styles.bigButton}>Create a free account</ButtonLink>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <span className={styles.footerLogo}>
          <LogoMark />
          Voice notes
        </span>
        <span>English only for now</span>
      </footer>
    </div>
  );
}

/** A real sample of the output, one card per kind of note (the same families the app uses). */
function ExampleCards() {
  const [done, setDone] = useState([true, false]);
  const items = [
    { text: "Book the gym for March 14", owner: "Dana, Monday" },
    { text: "Send the parent newsletter", owner: "Sam, Friday" },
  ];
  return (
    <section aria-label="Example notes from a staff meeting" className={`${styles.wrap} ${styles.cards}`}>
      <article className={`${styles.card} ${styles.summaryCard}`}>
        <span className={styles.tape} aria-hidden="true" />
        <h3 className={styles.cardLabel}>Summary</h3>
        <p className={styles.cardText}>The team agreed to move the science fair to the gym and split setup between two classes.</p>
        <p className={styles.cardMeta}>Staff meeting · 31 min</p>
      </article>

      <article className={`${styles.card} ${styles.decisionCard}`}>
        <span className={styles.pin} aria-hidden="true" />
        <h3 className={styles.cardLabel}>Decision</h3>
        <p className={styles.decisionText}>Science fair moves to the gym.</p>
        {/* handwriting is decoration, so the fact itself is also in plain text for screen readers */}
        <p className={`pencil ${styles.saidAt}`} aria-hidden="true">← said at <span className="tabular">4:12</span></p>
        <p className="visually-hidden">Said at 4:12.</p>
      </article>

      <article className={`${styles.card} ${styles.todoCard}`}>
        <span className={styles.tapeRight} aria-hidden="true" />
        <h3 className={styles.cardLabel}>To do</h3>
        <ul className={styles.todoList}>
          {items.map((item, i) => (
            <li key={item.text}>
              <label className={styles.todoItem}>
                <input type="checkbox" checked={done[i]} onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} />
                <span>
                  <span className={done[i] ? styles.done : undefined}>{item.text}</span>
                  <span className={styles.owner}>{item.owner}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </article>

      <article className={`${styles.card} ${styles.ideaCard}`}>
        <h3 className={styles.cardLabel}>Suggested next steps</h3>
        <p className={styles.ideaNote}>Ideas from the assistant. Nobody said these in the meeting.</p>
        <p className={styles.cardText}>Ask the PTA for two extra volunteers for setup day.</p>
      </article>
    </section>
  );
}
