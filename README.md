# Recrd — Script Gen

Electron desktop app that records browser interactions in an embedded
Chromium session via CDP, then generates Playwright, Cypress, Selenium,
or custom-template scripts — and can replay the captured steps back
against the same browser using the CDP protocol directly.

## Run

```
npm install
npm run build:renderer    # build the React renderer once
npm start                 # launch Electron against the built renderer
npm test                  # unit tests (node:test)
npm run dev               # Vite + Electron dev server with hot reload
```

Artifacts persist under `~/.config/recrd/`:
- `recrd-settings.json` — framework + custom mapping + last URL
- `recrd-sessions.json` — up to 20 saved sessions with steps + generated script

---

# Requirements Traceability

## Epic — Script Gen

**Goal:** turn an existing CDP-based test-recording CLI into a polished
Electron desktop tool that captures browser interactions, emits
framework-specific scripts, and replays recorded flows with visible
feedback — all without an external browser process.

Acceptance: a user can open the app, pick a framework, record a flow on
any URL, stop to review, replay with per-step status, generate and save
the script, and return later to inspect or re-run the saved session.

---

## User stories

Stories are ordered chronologically, matching how the product was built
up to its current state. Each story lists the commits that produced it.

---

### US-01 — Project bootstrap

**Title:** Scaffold an Electron + Vite + React project

**Description:** As a developer I need a reproducible toolchain so that
the app can be built and launched in dev and production modes.

**Acceptance:**
- `npm install` pulls Electron, Vite, React, @medv/finder, and nothing
  else beyond dev dependencies.
- `npm run build:renderer` produces a static bundle under `renderer-dist/`.
- `npm start` launches Electron loading that bundle.
- `npm run dev` runs Vite + Electron together with hot reload.
- `.gitignore` excludes `node_modules/`, `renderer-dist/`, screenshots.

**Commits:**
- `7024b8c` chore: init project scaffolding

---

### US-02 — Port selector + codegen from the legacy CLI

**Title:** Reuse the existing locator priority chain and framework
output templates

**Description:** As a user of the previous CLI I expect the same stable
locator strategy (`data-testid` → aria → id → CSS) and the same output
for Playwright / Cypress / Selenium, so that traces recorded under the
new UI produce code I already trust.

**Acceptance:**
- Locator resolver emits `shadowChain` and flags ambiguous selectors.
- Playwright uses role/label/placeholder/text/CSS with `>> pierce` for
  shadow chains.
- Cypress uses `cy.contains` / `cy.get` with `.shadow().find()` chains.
- Selenium uses `By.css`/`By.xpath` and a JS executor for shadow DOM.
- A new `custom` framework interpolates user templates keyed on step
  kind with placeholders like `{selector}`, `{value}`, `{url}`, `{key}`,
  `{checked}`.

**Commits:**
- `3e285d4` feat(recorder): selector priority chain and framework codegen

---

### US-03 — Page-injected capture script

**Title:** Capture clicks, fills, selects, toggles, Enter, submits, and
SPA navigations from inside the page

**Description:** As a user I expect the recorder to observe the actual
user actions in the page, including inside shadow DOM and iframes, so
that the resulting trace reflects what I did.

**Acceptance:**
- Uses `composedPath()` so clicks deep in shadow DOM resolve to the
  real target, and records the `shadowChain`.
- Debounces typing into a single `fill` event (350 ms inactivity).
- Captures `pushState`, `replaceState`, `hashchange`, `popstate` as
  navigation events.
- Redacts password fields unless `captureSensitive` is set.

**Commits:**
- `6f4d1fa` feat(recorder): page-injected capture with shadow DOM walking

---

### US-04 — Drive CDP from inside Electron

**Title:** Replace the ws-based CDP client with `webContents.debugger`
on an embedded `WebContentsView`

**Description:** As a user I don't want to run an external Chrome
process. The embedded browser inside the Electron app should be the
only browsing surface, and its debugger should be wired into the
recorder.

**Acceptance:**
- `Target.setAutoAttach(flatten: true)` so iframe sessions are covered.
- `Page.addScriptToEvaluateOnNewDocument` + `Runtime.evaluate` so both
  live and future contexts are instrumented.
- `Runtime.addBinding` + `Runtime.bindingCalled` deliver payloads.
- `pause()` / `resume()` gate capture without detaching — needed later
  for the Stop-but-keep-session story.

**Commits:**
- `ff5cff3` feat(recorder): DebuggerRecorder driven by webContents.debugger

---

### US-05 — Electron shell, IPC, and persistence

**Title:** Main process that owns the browser view, recorder, sessions
store, and IPC surface for the renderer

**Description:** As the UI I need a narrow, typed IPC contract to drive
the recorder, reposition the embedded browser, persist settings and
saved sessions, generate scripts, and copy/save output.

**Acceptance:**
- `BrowserWindow` for the UI, `WebContentsView` for the browser, hidden
  to 0×0 while the script dialog is open.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  no remote module.
- `recrd-settings.json` stores framework, custom mapping, last URL.
- `recrd-sessions.json` stores up to 20 sessions, each with full steps
  and (optionally) the generated script.

**Commits:**
- `34e2169` feat(main): Electron shell, IPC surface, sessions store

---

### US-06 — Branded app icon

**Title:** Ship a real taskbar icon so the window isn't a generic glyph

**Description:** As a user glancing at the taskbar I should see the
Recrd icon, not the default Electron/settings glyph.

**Acceptance:**
- 256×256 rounded blue square with white REC ring + dot.
- Wired via `BrowserWindow({ icon })` + `setAppUserModelId`.
- Generator script checked in so the PNG is reproducible without
  external image tooling.

**Commits:**
- `cd334e8` feat(app): generate and embed app icon

---

### US-07 — Renderer root with Google Cloud design tokens

**Title:** Build the UI shell to the Google Cloud Console / Material
light-mode spec

**Description:** As a user I want an information-dense, neutral,
utilitarian UI with consistent spacing, typography, and colour tokens.

**Acceptance:**
- Full token set as CSS custom properties (--blue, --teal, --green,
  --red, greys, shadow-1/2).
- Google Sans + Roboto Mono from Google Fonts.
- Component patterns for app bar, breadcrumb, cards, field inputs,
  radio items, buttons, REC chip, info bar, browser toolbar, step
  rows, dialog shell, stopped chip, summary bar, tabs.

**Commits:**
- `5f1c1aa` feat(ui): renderer root with Google Cloud Console design tokens

---

### US-08 — App bar, breadcrumb, inline icon set

**Title:** Product-shell chrome and an icon set with no runtime
dependency

**Description:** As a user I need consistent navigation cues and action
affordances at the top of every screen.

**Acceptance:**
- 56 px app bar with logo square, product name, primary-action slot,
  avatar.
- 40 px breadcrumb row with blue link + grey separator + grey-900
  current-page label.
- Icons are inline SVG; `actionIcon(kind)` maps step kinds to glyphs;
  CSS-only spinner for the replay-running row.

**Commits:**
- `ce41a45` feat(ui): app bar, breadcrumb, inline icon set

---

### US-09 — Startup screen with framework selector and session history

**Title:** First-screen configuration (framework + URL + custom mapping)
and history of saved sessions

**Description:** As a user landing in the app I want to pick a
framework, enter a starting URL, optionally define a custom mapping,
and see my previously recorded sessions.

**Acceptance:**
- Radios for Playwright / Cypress / Selenium / Custom with badges.
- Custom selection reveals an inline JSON editor with live validation
  and a placeholder-doc help line.
- Recent sessions list pulled from `recrd-sessions.json`; clicking a
  row opens the detail modal.

**Commits:**
- `c0de674` feat(ui): startup screen with framework selector and session history

---

### US-10 — Recording screen: toolbar + info bar + browser pane

**Title:** The screen the user spends most of their time on

**Description:** As a user I want to see a browser toolbar (nav + URL +
REC chip), an info bar (CDP / framework / counts / warnings), and the
embedded browser taking the left half of the window.

**Acceptance:**
- `WebContentsView` bounds pushed from the renderer; a 500 ms poll
  keeps it aligned through reflows.
- REC chip with a blinking dot + live `mm:ss` timer while recording.
- URL bar accepts bare hosts and prepends `https://`.
- Info bar shows CDP attached state, framework, step count, shadow
  count, and an orange warning pill when ambiguous locators exist.

**Commits:**
- `97853e4` feat(ui): recording screen with toolbar, info bar, browser pane

---

### US-11 — Step panel + script dialog + session detail modal

**Title:** Real-time recorded-step feed with rich per-step status and
a two-tab session viewer

**Description:** As a user I need to see each action as it's captured,
understand when a selector is resolved through shadow DOM or is
ambiguous, review or copy the generated script, and inspect any saved
session from history.

**Acceptance:**
- Step rows animate in (opacity + translateY).
- Visual states: live (blue border + blinking cursor), shadow (teal),
  replay running (blue spinner), pass (green tick + duration), fail
  (red cross + error line), dim-on-pending during replay.
- ScriptDialog renders the generated script with Copy and Save.
- SessionDetailModal has Steps / Generated Script tabs, Generate-Now
  fallback, Delete (left, danger) + Replay / Save / Copy Script
  (right).

**Commits:**
- `be75306` feat(ui): step list, script dialog, session detail modal

---

### US-12 — Unit tests for the pure modules

**Title:** Regression coverage for locator resolution and codegen

**Description:** As a maintainer I need tests that lock in the
selector priority chain and framework output behaviour.

**Acceptance:**
- Locator: stable-attribute preference, placeholder-over-css for text
  fields, ambiguous flagging, `shadowChain` passthrough.
- Codegen: trace normalisation, Playwright role output, Custom
  template interpolation, pierce syntax for Playwright, Cypress
  `cy.shadow().find()` chain.
- 9 tests, all passing via `npm test`.

**Commits:**
- `751e608` test: codegen and locator unit tests

---

### US-13 — CDP replay engine

**Title:** Replay recorded steps back through CDP without Playwright
or any other runtime

**Description:** As a user I want to verify a recorded flow by watching
it run back in the same browser, with per-step pass/fail feedback.

**Acceptance:**
- `__qsDeep` understands pierce syntax (`host >> host >> leaf`) and
  falls back to BFS through all shadow roots.
- Click dispatches real `Input.dispatchMouseEvent` at the element
  centre; fill uses the native value setter + `input`/`change`;
  select/check update property + dispatch `change`; press uses
  `Input.dispatchKeyEvent`; navigate uses `Page.navigate` with a
  `Page.loadEventFired` wait.
- Returns `ReplayResult[]` and never throws.
- Emits `replay:step:pass` / `replay:step:fail` per step; 500 ms
  inter-step delay.

**Commits:**
- `b621188` feat(replay): CDP replay engine with pre-action highlight

---

### US-14 — In-page dashed highlight before each replay action

**Title:** Show the user which element is about to be acted on

**Description:** As a user watching replay I want a clear visual
indicator of the target element before the action fires, so I can
tell apart "clicked the wrong thing" from "clicked the right thing"
from "couldn't find the element".

**Acceptance:**
- 2 px dashed blue ring + faint fill + soft outer glow at the
  element's viewport rect.
- `pointer-events: none`, max z-index so it sits above everything.
- Auto-fades over ~400 ms and self-cleans.
- 250 ms pause between drawing the ring and firing the action so the
  highlight is clearly pre-action.

**Commits:**
- `b621188` feat(replay): CDP replay engine with pre-action highlight

---

### US-15 — Stop without tearing down the session

**Title:** Stop halts capture only; the browser and steps stay for
review, replay, or script generation

**Description:** As a user I want Stop to freeze the step list so I can
review and replay, without losing the embedded browser or the
debugger session. A separate explicit "New Session" action is how I
start over.

**Acceptance:**
- `recorder.pause()` clears poll timers and gates all binding payloads
  via a `paused` flag — debugger stays attached.
- Toolbar switches from REC chip to a grey Stopped pill and reveals a
  "← New Session" button.
- URL bar and nav buttons are disabled in stopped mode.
- Step panel shows "Recording stopped. Review steps below." and
  enables the Replay button.

**Commits:**
- `ff5cff3` feat(recorder): DebuggerRecorder driven by webContents.debugger
- `34e2169` feat(main): Electron shell, IPC surface, sessions store
- `97853e4` feat(ui): recording screen with toolbar, info bar, browser pane
- `be75306` feat(ui): step list, script dialog, session detail modal

---

### US-16 — Session persistence + history + replay-from-history

**Title:** Save every stopped session and let me open, regenerate,
copy, save, replay, or delete it later

**Description:** As a user I want a reliable history of my recorded
sessions so I can revisit them across app launches.

**Acceptance:**
- On Stop, the current session is written to `recrd-sessions.json`
  with `{id, timestamp, url, framework, stepCount, steps,
  generatedScript}`. Cap 20; oldest trimmed.
- Startup screen renders the list; click opens the detail modal.
- Detail modal has Steps / Generated Script tabs, a Generate-Now
  fallback, and Delete / Replay / Save / Copy Script actions.
- "Replay Session" re-creates the embedded browser at the saved URL,
  loads the steps into the UI, and starts CDP replay once the page
  loads.

**Commits:**
- `34e2169` feat(main): Electron shell, IPC surface, sessions store
- `c0de674` feat(ui): startup screen with framework selector and session history
- `be75306` feat(ui): step list, script dialog, session detail modal

---

### US-17 — Script dialog never hidden by the embedded browser

**Title:** The HTML script dialog must be visible on top of the native
`WebContentsView`

**Description:** Bug report `i.png`: generated script dialog opens but
is covered by the embedded browser, so the code is unreadable.

**Acceptance:**
- When the dialog opens, the `WebContentsView` collapses to 0×0 so the
  HTML overlay is visible.
- When the dialog closes, the view is restored to the pane's bounds.
- Periodic bounds poll does not undo the hide — `browserHidden` flag
  wins.

**Commits:**
- `34e2169` feat(main): Electron shell, IPC surface, sessions store
- `5f1c1aa` feat(ui): renderer root with Google Cloud Console design tokens

---

### US-18 — Fix: Stop and Generate Script for sessions loaded from history

**Title:** "Replay Session" flow must leave Stop and Generate Script
functional, including for the Custom framework

**Description:** Bug report: after clicking "Replay Session" in the
session detail modal, the Stop and Generate Script buttons did
nothing. Root cause: `startReplayOnlySession` called `closeSession`
which nulled `state.recorder`, so the `script:generate` and
`recorder:stop` IPC handlers bailed on `!state.recorder`. Hits
Custom-framework users first because history-replay is the natural way
to iterate on a custom mapping.

**Acceptance:**
- Replay-loaded sessions instantiate a paused `DebuggerRecorder`
  seeded with the loaded steps via a new `loadSteps()` method.
- `state.recorder.getTraces()` returns those steps so Generate Script
  produces output for all four frameworks including Custom.
- `pauseRecording` emits the `recorder:stopped` event so the UI
  transitions to stopped state as expected.

**Commits:**
- `3449df6` fix(main): Stop and Generate work after Replay-Session from history

---

### US-19 — Reviewable step rows (click to expand long selectors)

**Title:** Long URLs, long selectors, and long error messages are
readable without leaving the sidebar

**Description:** Bug report `2.png`: `[data-testid="login-view-test-...`
and `Click target not found: [data-testid="logi...` were ellipsised
with no way to see the rest.

**Acceptance:**
- Click a step row to toggle an expanded state that un-truncates the
  selector, shadow chain, and error text.
- Hovering a row surfaces the full selector as a native tooltip.
- Expanded error messages wrap with `word-break: break-word`.

**Commits:**
- `be75306` feat(ui): step list, script dialog, session detail modal

---

## Notes for the GH Project import

For a GitHub Project, each US above maps to one issue / card:

| Field          | Source |
|----------------|--------|
| Title          | line after `### US-XX — ` |
| Description    | `Description:` + `Acceptance:` blocks |
| Linked commits | commits listed at the end of each US |

`gh project item-create` or the REST API can drive the import. A common
recipe is:

```
gh issue create --title "US-01 — Scaffold an Electron + Vite + React project" \
  --body "$(sed -n '/^### US-01/,/^---$/p' README.md)"
```

…then attach each issue to a project and cross-link commits via the
`gh api` call that appends a comment with the SHAs.
