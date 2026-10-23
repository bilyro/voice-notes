# Voice notes — Design spec

The approved UI. Every screen you build follows this file. The reference mockups are in
`docs/design/screens/` and on the design canvas:
https://claude.ai/artifact/7fmCoxQGEkqFpAXCTEFYGS

> The `.dc.html` files are **reference mockups, not production code**. They use a canvas
> format (`<x-dc>`, `support.js`). Read them for exact spacing, sizes and copy, then build
> the real screens as React components with the tokens below.

## 1. Principles ("Index cards", Task 1.20)

- **A planning wall.** Every page is a warm board with a faint dot grid. Things you read or act on sit on paper cards with a 2px paper edge and a soft lift. No gradients; the only "rings" are the record button's and the focus outline.
- **Card colors carry meaning.** Yellow = decision, green = action item / to-do, dashed lilac = an assistant idea. White = everything else (summary, lists, forms, recordings). The same colors tag the mode cards and the list tiles (meeting yellow, lesson green, memo lilac).
- **Red means recording.** Red is only for the record button, the live "Recording" badge, the pin on the decision card (the "recording family") and error text. Never for links, selection or decoration.
- **Straight where you work, tilted where you browse.** Content cards in the app never tilt. A ±1.5° tilt, tape and pins are allowed only for decoration on the landing page, sign in / sign up and empty states.
- **Handwriting is decoration.** Caveat ("pencil") is only for short margin notes, marked `aria-hidden`; never content, labels, buttons or errors. If a pencil note carries a fact, repeat it in plain text for screen readers.
- **One calm column.** Content sits in a single centered column next to a slim sidebar.
- **Facts vs suggestions.** What people said (summary, decisions, action items, open questions) sits on solid cards. AI suggestions always sit on the dashed lilac card labelled "Suggested next steps" with the line "Ideas from the assistant. Nobody said these in the meeting."
- **Every fact links back.** Decisions, open questions and transcript lines show a timestamp link that plays the audio from that moment.

## 2. Tokens

Put these in `apps/web/src/styles/tokens.css` and use only these values.

```css
:root {
  /* page */
  --color-board: #E9E4DC;           /* page background (the board) */
  --color-board-dot: #D6CFC3;       /* the dot grid on the board */

  /* paper */
  --color-bg: #FFFFFF;              /* cards, inputs, secondary buttons */
  --color-surface: #F4F0E9;         /* warm paper: sidebar, tab panels, the player track area, info notes */
  --color-surface-selected: #FFFFFF;/* active sidebar item (a white card) */
  --color-line: #D6CFC3;            /* borders, dividers, inactive pills */
  --color-card-edge: #CFC7BA;       /* the 2px bottom edge under white cards */
  --color-track: #E9E4DC;           /* player and progress tracks */
  --color-wave-past: #CFC7BA;       /* waveform history bars */

  /* card families: a fill, the edge under it, and the text color on it */
  --color-card-decision: #FFF1B8;      --color-card-decision-edge: #D9C67E; --color-card-decision-ink: #6B5A1E;
  --color-card-todo: #D9F2E3;          --color-card-todo-edge: #A9D3BA;     --color-card-todo-ink: #2F5E43;
  --color-card-idea: #EEEAFB;          --color-card-idea-edge: #9C8BD6;     --color-card-idea-ink: #4B3C8F;

  /* ink */
  --color-ink: #1F1B16;             /* text, primary buttons, progress fill */
  --color-ink-soft: #4A433A;        /* body text on cards and notes */
  --color-ink-muted: #6E655A;       /* secondary text, meta, timestamps (4.6:1 on the board) */
  --color-pencil: #8A5A2B;          /* handwritten margin notes (decoration only) */

  /* red is for recording (and error text) */
  --color-record: #D93A2E;          /* record button, live dot, the decision pin */
  --color-record-dark: #8E2119;     /* shadow under the pin, text on the Recording badge */
  --color-record-soft: #FBE3DF;     /* ring around record button, "Recording" badge */
  --color-record-on-dark: #FF6B5E;  /* red dot inside the black "New recording" button */
  --color-error: #B42318;           /* error text */

  --color-tape: #F3E3B5;            /* tape strips on decorative cards */

  /* type */
  --font-sans: 'Work Sans', 'Segoe UI', system-ui, sans-serif;
  --font-hand: 'Caveat', 'Segoe Print', cursive;   /* margin notes only: never content, labels or buttons */

  /* radius (by element) */
  --radius-card: 4px;  /* every card, list row, the player, tab panels */
  --radius-sm: 8px;    /* small buttons inside rows and cards */
  --radius-input: 10px;/* inputs, selects, secondary buttons */
  --radius-md: 12px;   /* primary buttons, the sidebar "New recording" */
  --radius-lg: 4px;    /* kept for old call sites: same as a card */
  --radius-xl: 4px;    /* kept for old call sites: same as a card */
  --radius-pill: 999px;/* chips and filter pills */

  /* depth: a 2px paper edge, plus a soft lift for cards that sit on the board */
  --shadow-lift: 0 10px 20px rgba(31, 27, 22, 0.07);
  --shadow-edge: 0 2px 0 var(--color-card-edge);
  --shadow-card: var(--shadow-edge), var(--shadow-lift);

  /* spacing scale */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 40px; --space-8: 56px;
}
```

Fonts: load **Work Sans** (400, 500, 600, 800) and **Caveat** (500, 700) from Google Fonts in `apps/web/index.html`. Work Sans is for everything; Caveat only through the `.pencil` class (section 1).
All numbers that change (timers, timestamps, durations, minutes used) use `font-variant-numeric: tabular-nums`.

## 3. Typography

| Use | Size / weight | Notes |
|---|---|---|
| Page title (h1) | 40px / 800 | letter-spacing −0.03em, line-height 1.1 |
| Phone title | 24px / 800 | |
| Section heading (h2) | 20px / 800 | |
| Card label | 14px / 600 | sentence case, in the card family's ink ("Decisions", "Action items") |
| Summary paragraph | 19px / 400 | line-height 1.6 |
| Body | 16px / 400 | line-height 1.55 |
| UI text (buttons, inputs) | 15px | |
| Meta, secondary | 14px | color `--color-ink-muted` |
| Small labels (sidebar footer) | 13px | |
| Phone timer | 84px / 500 | letter-spacing −0.03em, tabular numbers |
| Landing hero (landing page h1 only) | 64px / 800 | letter-spacing −0.035em, line-height 1.02; 40px at phone width. Landing section titles 36px, the phone title size (24px) on a phone |
| Pencil (Caveat) | 22–30px / 500 | `--color-pencil`, decoration only |

Writing: sentence case everywhere, no ALL CAPS labels, plain verbs on buttons ("Start recording", "Stop and save", "Try again", "Copy as Markdown").

## 4. Layout

- **App shell:** a flex row that wraps. Sidebar `flex: 1 1 240px` with a right border; content `flex: 999 1 560px; min-width: 0`. On a phone the sidebar stacks on top.
- **Content width:** Recording detail max 760px, Recordings list max 880px, New recording form max 560px. Centered, side padding `clamp(16px, 4vw, 40px)`, top padding 36–44px.
- **Touch targets:** at least 44px high for anything clickable (36px allowed for pills and small buttons inside rows).
- **Focus:** every interactive element shows `outline: 2px solid var(--color-ink); outline-offset: 2px` on `:focus-visible`.

## 5. Components

| Component | Look |
|---|---|
| `Sidebar` | warm paper (`--color-surface`) with a line on the right. Top to bottom: `LogoMark` + "Voice notes" 19/800 linking to `/about` (keeps ink on hover, rounded focus outline); black "New recording"; nav "All recordings" + count (selected = white card with the paper edge); "Recent": the 3 newest recordings as mini white cards with a 4px left edge in the mode's card-edge color, title 14/600 + "Mode · Day" or the processing step, current one outlined; account card at the bottom (initials circle in decision yellow, email with ellipsis, 36px "Sign out" icon button). On a phone (stacked) Recent is hidden. Design canvas, "Sidebar: 3 options", option A |
| `Button` primary | black fill, white text, radius md (12), 44px (48–52 on landing / auth) |
| `Button` secondary | white, 1px `--color-line` border, radius input (10), 40px, icon + label |
| `IconButton` | 40px square, same as secondary, `aria-label` required |
| `RecordButton` | red circle (104px desktop, 84px phone), 8–10px `--color-record-soft` ring; white dot = start, white rounded square = stop |
| `Chip` | white pill with the paper edge, 14px — mode labels ("Meeting") |
| `FilterPills` | pills; selected = black fill + white text, `aria-pressed` |
| `SegmentedControl` | choice cards in a grid, each in its tone (`decision` / `todo` / `idea`, or white), a drawn radio dot; selected = 2px ink outline + 800 label; real radio inputs inside |
| `Tabs` | folder tabs: the selected tab and its panel are one piece of warm paper (`--color-surface`, paper edge), 800 label; `role="tablist"`, arrow keys |
| `AudioPlayer` | white card: black round play/pause (44px), current time, 6px track with ink fill and a 3px red playhead line, total time, bordered speed button |
| `ProgressBar` | 4px, track `--color-line`, fill ink |
| `ListRow` | a white card (`--shadow-card`), 14px gap between cards: 40px icon tile in the mode's card color + title (18/600) + meta line + status + date |
| `StatusLabel` | ready = ink check icon; processing = muted text + small progress bar; failed = error text + "Try again" secondary button |
| `ActionItemRow` | checkbox (accent ink) + text + "Owner, by Day" in muted; done = line-through muted; no owner = "No owner or date yet" + "Assign" button |
| `TimestampLink` | muted 14px tabular link ("0:46") that seeks the player |
| `InfoNote` | white card with the paper edge, 14px `--color-ink-soft` text (Free plan notice) |
| `SuggestionBox` | the idea card: `--color-card-idea`, 2px dashed `--color-card-idea-edge`, idea-ink heading + the fixed "Ideas from the assistant…" line |
| Notes cards | one card per section: Summary and other lists white; Decisions yellow with the red pin; Action items green (rows divided by the green edge); Suggested next steps = the idea card |
| App icon | a tilted white index card on the board color, red dot as the first bullet and three ink lines (`apps/web/public/favicon.svg`, rounded; `apple-touch-icon.png` 180px, square and opaque because iOS rounds it) |
| `TranscriptRow` | grid: 52px timestamp + (speaker 14px/600, text 16px) on one white sheet; the currently playing row gets the decision yellow, like a highlighted line |

## 6. Screens

| Screen | Reference file | Built in task |
|---|---|---|
| **Look of every screen** (Index cards; the boards below win over the older white mockups wherever they differ) | design canvas, row "Chosen: Index cards": `CardsTokens`, `CardsRecordings`, `CardsDetail`, `CardsRecord`, `CardsSignIn`; landing: `StyleCorkboard` | Task 1.20 |
| App shell (sidebar + content) | any screen | Task 0.7 |
| New recording | `screens/NewRecording.dc.html` | Task 1.11 |
| New recording: under the record button, a thin line, "or" and a secondary "Upload an audio file" button (upload icon) with a 14px muted hint. While uploading: the page title "Uploading", the white start card with the file name (600), "m:ss · size", a 6px ink progress bar (`role=progressbar`), the status line (ink 600 when offline, like Task 1.22), errors in red with "Try again", and a secondary "Cancel upload" | Task 1.27 (no mockup) | Task 1.27 |
| New recording: "Language" select between Title and Microphone (English, Ukrainian — українська, Spanish — español) with a 14px muted hint under it, the same input style as the microphone select; remembered per browser. While recording, a non-English language shows as a second chip next to the mode chip | Task 1.26 (no mockup, one field) | Task 1.26 |
| New recording: under the microphone's input level, a 14px muted hint: "Recording a video or a call on this computer? Play it through the speakers: headphones keep the sound away from the microphone." Recording detail, failed with no speech: under "No speech found in the audio" + Try again, a muted line on what to check | Task 1.31 (text only) | Task 1.31 |
| Recording in progress | `screens/PhoneRecording.dc.html` (same layout, centered in the content column on desktop) | Task 1.11 (web), Phase 4 (native app) |
| Recording in progress, no connection: the hint under the controls turns into an ink 600 status "No connection. Keep recording: the last m:ss is kept here…"; after Stop, "Saving… waiting for the connection…" in the same style. Ink, not red: nothing is wrong yet | Task 1.22 (no mockup, text change only) | Task 1.22 |
| Recordings | `screens/Recordings.dc.html` | Task 1.12 |
| Recordings: search. A white field (48px, input radius, paper edge) with a search icon above the type pills, placeholder "Search titles, transcripts and notes". Results replace the list: "N recordings found", the same row cards with the title (matched words marked) and up to 3 match lines ("Notes" label or a tabular timestamp link + snippet). Matched words get a `<mark>` in decision yellow, the same as the transcript's playing line. While a new query loads, the old results are dimmed to 0.55 and the status says "Searching…". Empty: "No recordings match “q”" | the mockup's search field; results: Task 1.28 (no mockup) | Task 1.28 |
| Action items (`/action-items`): Open · Done · All pills (left) and an "Owner" select (right); one green to-do card per recording (title as a link 18/600, "Mode · date" in the to-do ink), rows exactly like the detail page's action items (checkbox, text, "owner · date"). Empty: "Nothing open. Nice." / "Nothing ticked off yet.". Sidebar: "Action items" nav item with the open count, under "All recordings" | Task 1.29 (no mockup; reuses the to-do card) | Task 1.29 |
| Recording detail (Notes / Transcript tabs) | `screens/RecordingDetail.dc.html` | Task 1.13, buttons in 1.14 |
| Sign in / Create account: form column on the right (max 400px, logo links to `/`), grey panel on the left (example notes / the 3 steps + free-plan note), stacking under the form on a phone; Show/Hide password; errors are red text only | design canvas, artboards `SignIn`, `SignUp` | Task 1.19 |
| About (`/about`, everyone): the landing page; signed in, the header shows "Open my recordings" and the hero / final buttons become "New recording" and "Open my recordings" | design canvas, `StyleCorkboard` | Task 1.21 |
| Landing page (`/` when signed out): header, hero + example notes card, how it works, modes + suggestion box, free plan, final call to action, footer | design canvas, artboard `Landing` | Task 1.18 |
| Recording detail: delete (secondary "Delete" at the end of the actions row, every status; inline grey confirmation with black "Delete recording" + "Keep it", no modal) | design canvas, artboard `DeleteRecording` | Task 1.17 |
| Recording detail: share. A secondary "Share" button (link icon; "Shared" while a link is on) opens an inline panel like Delete's (only one of the two is open at a time): "Share these notes", "Anyone with the link can read these notes. The transcript and audio stay private.", then "Create link", or the link in a read-only surface-coloured field with black "Copy link" (→ "Copied") and secondary "Turn off link". Escape closes it | Task 1.30 (no mockup) | Task 1.30 |
| Shared notes (`/s/:token`, public): the board, the logo (→ `/about`) top left, no sidebar; "Shared notes · read-only" (14/600 muted), the title (h1), "Mode · date · N min", then the notes cards exactly as in the app with the checkboxes disabled; footer "Made with Voice notes". A dead link: a white card "This link doesn't work any more." with "What is Voice notes?" | Task 1.30 (no mockup; reuses the notes cards) | Task 1.30 |

Some things in the mockups arrive later. Show them only when their task is built:
search (Phase 2), Action items page (Phase 2), Settings, minutes-used meter (Task 1b.4), "Assign" button (Phase 2).

Not designed yet (follow this spec when you get there): empty states (for now: one white card on the board), Settings, Action items page, lesson-mode sections (Concepts, Review questions — use the same section style as Decisions), memo-mode Ideas.

## 7. States to always handle

- **Empty:** "No recordings yet" + black "New recording" button. An empty screen invites the next action.
- **Processing:** status label with progress, and the detail page shows the step (Uploaded → Transcribing → Writing notes → Ready).
- **Errors:** say what happened and what to do ("No speech found in the audio" + "Try again"). Errors never apologize and are never vague.
