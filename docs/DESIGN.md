# Voice notes — Design spec

The approved UI. Every screen you build follows this file. The reference mockups are in
`docs/design/screens/` and on the design canvas:
https://claude.ai/artifact/7fmCoxQGEkqFpAXCTEFYGS

> The `.dc.html` files are **reference mockups, not production code**. They use a canvas
> format (`<x-dc>`, `support.js`). Read them for exact spacing, sizes and copy, then build
> the real screens as React components with the tokens below.

## 1. Principles

- **Clean white and minimal.** White page, near-black text, light grey lines. No gradients, no shadows except the soft ring around the record button.
- **Red means recording.** Red is used only for the record button, the live "Recording" badge and error text. Never for links, selection or decoration.
- **One calm column.** Content sits in a single centered column next to a slim sidebar.
- **Facts vs suggestions.** What people said (summary, decisions, action items, open questions) looks normal. AI suggestions always sit in a grey box labelled "Suggested next steps" with the line "Ideas from the assistant. Nobody said these in the meeting."
- **Every fact links back.** Decisions, open questions and transcript lines show a timestamp link that plays the audio from that moment.

## 2. Tokens

Put these in `apps/web/src/styles/tokens.css` and use only these values.

```css
:root {
  /* color */
  --color-bg: #FFFFFF;              /* page */
  --color-surface: #F6F7F8;         /* player, info notes, suggestion box, search field, icon tiles */
  --color-surface-selected: #EEF0F2;/* active sidebar item */
  --color-line: #E6E8EB;            /* borders, dividers, inactive pills */
  --color-track: #DDE0E4;           /* player track */
  --color-wave-past: #C9CDD2;       /* waveform history bars */
  --color-ink: #1C2026;             /* text, primary buttons, progress fill */
  --color-ink-soft: #3E444C;        /* text inside info notes */
  --color-ink-muted: #5F6670;       /* secondary text, meta, timestamps */
  --color-record: #D92D20;          /* record button, live dot */
  --color-record-soft: #FDECEA;     /* ring around record button, "Recording" badge */
  --color-record-on-dark: #FF6B5E;  /* red dot inside the black "New recording" button */
  --color-error: #B42318;           /* error text */

  /* type */
  --font-sans: 'Instrument Sans', 'Segoe UI', system-ui, sans-serif;

  /* radius (by size of the element, not one value everywhere) */
  --radius-sm: 6px;    /* small text buttons */
  --radius-md: 8px;    /* buttons, inputs, sidebar items */
  --radius-lg: 10px;   /* search field, info note, list icon tiles, transcript rows */
  --radius-xl: 12px;   /* suggestion box */
  --radius-pill: 999px;/* chips, filter pills, audio player */

  /* spacing scale */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 40px; --space-8: 56px;
}
```

Font: load **Instrument Sans** (weights 400, 500, 600, 700) from Google Fonts in `apps/web/index.html`.
All numbers that change (timers, timestamps, durations, minutes used) use `font-variant-numeric: tabular-nums`.

## 3. Typography

| Use | Size / weight | Notes |
|---|---|---|
| Page title (h1) | 36px / 600 | letter-spacing −0.015em, line-height 1.15 |
| Phone title | 24px / 600 | |
| Section heading (h2) | 20px / 600 | Action items, Decisions, … |
| Summary paragraph | 19px / 400 | line-height 1.6 |
| Body | 16px / 400 | line-height 1.55 |
| UI text (buttons, inputs) | 15px | |
| Meta, secondary | 14px | color `--color-ink-muted` |
| Small labels (sidebar footer) | 13px | |
| Phone timer | 84px / 500 | letter-spacing −0.03em, tabular numbers |
| Landing hero (landing page h1 only) | 56px / 600 | letter-spacing −0.025em, line-height 1.05; 40px at phone width. Landing section titles use the page title size (36px), the phone title size (24px) on a phone |

Writing: sentence case everywhere, no ALL CAPS labels, plain verbs on buttons ("Start recording", "Stop and save", "Try again", "Copy as Markdown").

## 4. Layout

- **App shell:** a flex row that wraps. Sidebar `flex: 1 1 240px` with a right border; content `flex: 999 1 560px; min-width: 0`. On a phone the sidebar stacks on top.
- **Content width:** Recording detail max 760px, Recordings list max 880px, New recording form max 560px. Centered, side padding `clamp(16px, 4vw, 40px)`, top padding 36–44px.
- **Touch targets:** at least 44px high for anything clickable (36px allowed for pills and small buttons inside rows).
- **Focus:** every interactive element shows `outline: 2px solid var(--color-ink); outline-offset: 2px` on `:focus-visible`.

## 5. Components

| Component | Look |
|---|---|
| `Sidebar` | Logo (red 10px dot + "Voice notes"), black "New recording" button, nav (Recordings, Action items with "N open", Settings), footer with "This month: X of Y min" + 4px bar + plan name |
| `Button` primary | black fill, white text, radius md, 44px |
| `Button` secondary | white, 1px `--color-line` border, radius md, 40px, icon + label |
| `IconButton` | 40px square, same as secondary, `aria-label` required |
| `RecordButton` | red circle (104px desktop, 84px phone), 8–10px `--color-record-soft` ring; white dot = start, white rounded square = stop |
| `Chip` | pill, 1px line border, 14px — mode labels ("Meeting") |
| `FilterPills` | pills; selected = black fill + white text, `aria-pressed` |
| `SegmentedControl` | grey track, selected segment white with 1px line ring; real radio inputs inside |
| `Tabs` | text tabs, selected = 600 weight + 2px ink underline, `role="tablist"` |
| `AudioPlayer` | grey capsule: black round play/pause (44px), current time, 4px track with ink fill and 14px knob, total time, speed button |
| `ProgressBar` | 4px, track `--color-line`, fill ink |
| `ListRow` | 40px icon tile (grey, radius lg) + title (600) + meta line + status + date, divider below |
| `StatusLabel` | ready = ink check icon; processing = muted text + small progress bar; failed = error text + "Try again" secondary button |
| `ActionItemRow` | checkbox (accent ink) + text + "Owner, by Day" in muted; done = line-through muted; no owner = "No owner or date yet" + "Assign" button |
| `TimestampLink` | muted 14px tabular link ("0:46") that seeks the player |
| `InfoNote` | grey surface, radius lg, 14px `--color-ink-soft` text (Free plan notice) |
| `SuggestionBox` | grey surface, radius xl, heading + the fixed "Ideas from the assistant…" line |
| App icon | "Recorded note": `--color-ink` tile, red record dot as the first bullet, three white note lines (`apps/web/public/favicon.svg`, rounded; `apple-touch-icon.png` 180px, square and opaque because iOS rounds it). Design canvas, artboard `AppIcon`, option A |
| `TranscriptRow` | grid: 52px timestamp + (speaker 14px/600, text 16px); currently playing row gets `--color-surface` background and ink timestamp |

## 6. Screens

| Screen | Reference file | Built in task |
|---|---|---|
| App shell (sidebar + content) | any screen | Task 0.7 |
| New recording | `screens/NewRecording.dc.html` | Task 1.11 |
| Recording in progress | `screens/PhoneRecording.dc.html` (same layout, centered in the content column on desktop) | Task 1.11 (web), Phase 4 (native app) |
| Recordings | `screens/Recordings.dc.html` | Task 1.12 |
| Recording detail (Notes / Transcript tabs) | `screens/RecordingDetail.dc.html` | Task 1.13, buttons in 1.14 |
| Sign in / Create account: form column on the right (max 400px, logo links to `/`), grey panel on the left (example notes / the 3 steps + free-plan note), stacking under the form on a phone; Show/Hide password; errors are red text only | design canvas, artboards `SignIn`, `SignUp` | Task 1.19 |
| Landing page (`/` when signed out): header, hero + example notes card, how it works, modes + suggestion box, free plan, final call to action, footer | design canvas, artboard `Landing` | Task 1.18 |
| Recording detail: delete (secondary "Delete" at the end of the actions row, every status; inline grey confirmation with black "Delete recording" + "Keep it", no modal) | design canvas, artboard `DeleteRecording` | Task 1.17 |

Some things in the mockups arrive later. Show them only when their task is built:
search (Phase 2), Action items page (Phase 2), Settings, minutes-used meter (Task 1b.4), "Assign" button (Phase 2).

Not designed yet (follow this spec when you get there): empty states, Settings, Action items page, lesson-mode sections (Concepts, Review questions — use the same section style as Decisions), memo-mode Ideas.

## 7. States to always handle

- **Empty:** "No recordings yet" + black "New recording" button. An empty screen invites the next action.
- **Processing:** status label with progress, and the detail page shows the step (Uploaded → Transcribing → Writing notes → Ready).
- **Errors:** say what happened and what to do ("No speech found in the audio" + "Try again"). Errors never apologize and are never vague.
