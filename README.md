# Harness — Script & Doc Gen

Electron desktop app that records browser interactions in an embedded
Chromium session via CDP and emits either:
- test scripts (Playwright / Cypress / Selenium / custom template), or
- annotated walkthroughs (HTML / PDF with per-click screenshots and
  bounding-box callouts).

Steps can be replayed back against the same browser using the CDP
protocol directly, with visible per-step pass/fail feedback.

The project was previously known as `recrd`. Existing history under
`~/.config/recrd/` is migrated automatically on first launch.

## Run

```
npm install
npm run build:renderer    # build the React renderer once
npm start                 # launch Electron against the built renderer
npm test                  # unit tests (node:test)
npm run dev               # Vite + Electron dev server with hot reload
```

Artifacts persist under `~/.config/Harness/`:
- `harness-settings.json` — framework + custom mapping + last URL + viewport
- `harness-sessions.json` — up to 20 saved sessions with steps + generated script

Legacy files under `~/.config/recrd/` are migrated automatically on
first launch.

## Corporate networks / offline installs

`npm install` downloads the Electron Chromium binary from
`github.com/electron/electron/releases`. On networks that block GitHub
or require egress through an internal mirror, set one of the env vars
below before `npm install`. `.npmrc.example` is checked in as a
template; copy it to `.npmrc` (which is git-ignored) and edit.

| Env var / npm key                 | What it does |
|-----------------------------------|--------------|
| `ELECTRON_MIRROR` / `electron_mirror` | Base URL of an internal Electron release mirror (Artifactory / Nexus / S3). Must end with `/`. |
| `ELECTRON_CUSTOM_DIR` / `electron_custom_dir` | Path template under the mirror. Default `{{ version }}`. |
| `ELECTRON_CACHE` | Reuse a pre-populated download cache (e.g. a shared fileshare). |
| `ELECTRON_SKIP_BINARY_DOWNLOAD=1` | Skip the Chromium download entirely — use when IT pre-stages the binary under `node_modules/electron/dist/`. |

Quick examples:

```bash
# Internal Artifactory mirror
ELECTRON_MIRROR=https://artifactory.company.local/electron/ npm install

# Pre-staged binary, skip download
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install

# Shared offline cache
ELECTRON_CACHE=/shared/npm/electron npm install
```

Once installed, no further network access is needed — the app runs
entirely against the embedded Chromium. The embedded browser *does*
hit the internet to load whatever URL you record against; that
traffic flows through the normal system proxy settings.

---

# Requirements Traceability

## Epic — Harness (Script & Doc Gen)

**Goal:** turn an existing CDP-based test-recording CLI into a polished
Electron desktop tool that captures browser interactions and emits
either framework-specific test scripts or annotated PDF walkthroughs,
with visible replay of recorded flows — all without an external
browser process.

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

### US-34 — Drop `abstract` codegen alias

**Title:** Remove the dead `abstract` framework synonym inherited
from the legacy CLI

**Description:** `codegen.js` treated `"abstract"` as a synonym
for `"custom"`; nothing in the app references `"abstract"` any
more. Dead code removed.

**Commits:**
- `62dc695` feat: viewport emulation, pause/resume, wait step, drop abstract alias

---

### US-33 — Merge Doc Gen export entry points

**Title:** One Export button in Doc Gen instead of two
similar-looking primary/secondary actions

**Description:** In Doc Gen mode the app had both a primary
"Generate PDF" button and a secondary "Export HTML" button that
opened the same dialog with different defaults — users had to
learn which was which. Collapsed to a single primary **Export
walkthrough** button that opens the export dialog; the existing
HTML/PDF toggle inside the dialog selects the format.

**Acceptance:**
- Doc Gen mode: AppBar primary is "Export walkthrough",
  secondary is null.
- Script Gen mode unchanged: primary remains "Generate Script",
  secondary remains "Export Journey".

**Commits:**
- `437c1dc` feat(ui): viewport selector, pause toggle, Wait button, session search, merged export

---

### US-32 — Search / filter sessions

**Title:** Let users search the recent-sessions list by name or
URL when the list grows beyond a handful

**Description:** With the 20-session cap the history list quickly
exceeds a glance. A single input over the list filters entries in
real time (case-insensitive contains match on name and URL).

**Acceptance:**
- Search input renders only when there is at least one session.
- Empty results state: `No sessions match "query"`.
- No debounce — list is small enough that keystrokes are
  non-jittery.

**Commits:**
- `437c1dc` feat(ui): viewport selector, pause toggle, Wait button, session search, merged export

---

### US-31 — Wait / sleep step

**Title:** Let users insert explicit waits into a recording; render
them as the framework-native timeout calls

**Description:** Test and doc flows often need to pause for
transitions, animations, or async loading. A dedicated wait step
kind makes this first-class — append via the toolbar button, or
insert mid-flow from the ⋯ menu on any step row.

**Acceptance:**
- Recorder: `addWait(ms)` appends; `insertWaitAfterNumber(n, ms)`
  splices a wait step after a specific step number.
- Toolbar "Wait" button (Ctrl+Shift+W) adds at the end; row menu
  "Insert wait after" inserts right after that step.
- WaitDialog: numeric ms input, Enter to commit, Esc to cancel.
- Codegen: Playwright `page.waitForTimeout`, Cypress `cy.wait`,
  Selenium `driver.sleep`; Custom mapping key `wait:
  "await this.wait({ms})"`.
- Replay engine honors the ms (actually sleeps for the requested
  duration), so replay timing reflects intent.

**Commits:**
- `62dc695` feat: viewport emulation, pause/resume, wait step, drop abstract alias
- `437c1dc` feat(ui): viewport selector, pause toggle, Wait button, session search, merged export

---

### US-30 — Pause / resume capture

**Title:** Let users temporarily stop capture without ending the
session, for setup work they don't want in the script

**Description:** Previously Stop was terminal — if a user needed
to navigate around (log in, seed data) without those clicks
polluting the script, they had to stop-and-restart. Pause lets
them toggle capture off, do setup work, then resume where they
left off.

**Acceptance:**
- Recorder already had `pause()` / `resume()` methods; IPC
  `recorder:toggle-pause` flips the state.
- Toolbar pause/resume button with Ctrl+Shift+P shortcut.
- While paused: REC chip becomes a muted orange PAUSED chip,
  capture script payloads are gated (via `this.paused`), the
  elapsed timer keeps running.
- Stop and debugger detach behavior unchanged — pause is purely
  a capture filter.

**Commits:**
- `62dc695` feat: viewport emulation, pause/resume, wait step, drop abstract alias
- `437c1dc` feat(ui): viewport selector, pause toggle, Wait button, session search, merged export

---

### US-29a — Viewport presets (Desktop / Tablet / Mobile)

**Title:** Let users record at device-specific viewports instead
of always using the host window's dimensions

**Description:** Table stakes for real test teams. Desktop
(1440×900, no emulation), Tablet (768×1024, iPad UA), Mobile
(390×844, iPhone UA) with touch emulation enabled on the mobile
presets.

**Acceptance:**
- Viewport segmented control on the startup screen, persisted
  across sessions.
- Applied via CDP `Emulation.setDeviceMetricsOverride`,
  `setUserAgentOverride`, and `setTouchEmulationEnabled`.
- Desktop clears overrides so sites serve their real desktop
  experience.
- Viewport is stored on the session and round-trips through
  history, so replay uses the same emulation as the original
  recording.

**Commits:**
- `62dc695` feat: viewport emulation, pause/resume, wait step, drop abstract alias
- `437c1dc` feat(ui): viewport selector, pause toggle, Wait button, session search, merged export

---

### US-29 — Named sessions

**Title:** Let users name each recording ("Checkout flow",
"Admin onboarding") so history is scannable at a glance

**Description:** The session list showed timestamps + URL, which
is fine for one session but useless once there are a dozen. A
free-text name becomes the primary identifier everywhere the
session appears.

**Acceptance:**
- Side panel shows an editable name at the top — "Untitled
  session" in grey italic until set; click to edit, Enter
  commits, Esc reverts.
- SessionDetailModal title doubles as a rename control; the URL
  demotes to the meta row.
- Startup recent list renders the name as the headline with the
  URL reduced to a mono byline below.
- Main carries `state.session.name` through start / stop /
  replay / persist, so the name round-trips through history
  without extra plumbing.
- IPC: `session:set-name` for the active session;
  `sessions:rename(id, name)` for stored entries.

**Commits:**
- `88b19d5` feat(ui): name your sessions — editable title, persisted to history

---

### US-28 — Capture-area annotation tool

**Title:** Drag-to-select a region on the live page and annotate
it, so manual callouts become first-class steps alongside the
auto-captured ones

**Description:** Doc Gen auto-captures the clicked element on
every interactive step, but sometimes the user wants to circle an
*arbitrary* region — a balance row, an error banner, a specific
text block — and write a sentence about it. This is the manual
equivalent of "snipping tool" inside the app.

Hijacking the embedded browser's rendering was impossible because
the `WebContentsView` is a native child view that always sits on
top of the renderer's HTML. Solution: freeze the page by taking a
snapshot, hide the view (`setVisible(false)`, reused from the
script-dialog fix), and put a full-screen HTML overlay with the
snapshot as background. Selection and annotation happen on pure
HTML where the renderer is already powerful.

**Acceptance:**
- New capture step kind with `{screenshot, rect (viewport-%),
  text}`.
- Main IPC: `capture:snapshot` (capturePage, returns data URL +
  current URL); `capture:save` (pushes a capture step).
- Renderer `CaptureOverlay`: drag to draw a rectangle, popup
  appears beside it for the caption, Redraw / Save / Cancel
  controls, Esc cancels. Enforces a 6 px minimum size so stray
  clicks do not commit an empty rectangle.
- Browser toolbar gains a **Capture area** button; Ctrl+Shift+S
  opens the overlay from anywhere in the window. Available in
  both Script Gen and Doc Gen.
- StepList renders capture rows on a blue-light card with a
  camera icon and the caption in place of a selector.
- Codegen: captures render as `// [annotated capture] …`
  comments in scripts; HTML/PDF render the full screenshot with
  an inset rectangle matching the user's selection plus the
  caption.

**Commits:**
- `50f90e9` feat(recorder): capture step — annotated rectangle over a page snapshot
- `57e33f0` feat(ui): Capture area selection tool + annotation popup

---

### US-27 — Assertions

**Title:** Let the user add `expect(...)` assertions to a recording;
render them natively in every framework output

**Description:** Recorded scripts without assertions aren't real
tests. A dedicated assert step kind lets a user attach
visibility / text / value expectations to any selector, and every
codegen path emits the framework-idiomatic call.

**Acceptance:**
- New assert step kind with `{assertionType, expected, locator}`
  where assertionType ∈ visible | hidden | text | contains | value.
- Add Assertion toolbar button (Script Gen only) plus Ctrl+Shift+A
  shortcut. Modal pre-fills the selector from the last interactive
  step; expected field only renders when the chosen type needs it.
- Codegen:
  - Playwright → `await expect(locator).toBeVisible()` /
    `.toHaveText()` / `.toContainText()` / `.toHaveValue()` /
    `.toBeHidden()`; import switches to `@playwright/test` when
    assertions are present.
  - Cypress → `.should('be.visible' | 'have.text' | 'contain' |
    'have.value' | 'not.be.visible')`.
  - Selenium → inline `isDisplayed / getText / getAttribute`
    checks that throw on mismatch.
  - Custom mapping → `assertVisible`, `assertHidden`,
    `assertText`, `assertContains`, `assertValue` keys.
- StepList renders asserts on a green-bg card with a check icon.
- HTML / PDF render asserts as a green callout block.
- Replay engine skips asserts (no-op, passes instantly). Full
  replay-side verification is deferred.

**Commits:**
- `0b323f4` feat(recorder): mutation API + assertion step kind
- `70a5d9e` feat(ui): per-step edit/delete + Add Assertion dialog

---

### US-26 — Per-step edit / delete

**Title:** Let users fix or drop an individual step without
re-recording the whole flow

**Description:** Until now `Clear` was the only way to undo a
capture — nuclear if you had 30 good steps and one bad one. Users
need to delete a single step or override its selector / value.

**Acceptance:**
- Recorder persists `number` on each event (was previously only
  carried on the emitted copy) and loadSteps preserves it, so a
  stable key exists for mutations.
- New recorder methods: `deleteStepByNumber(n)`,
  `updateStepByNumber(n, patch)`. Patch accepts `value`, `text`,
  `expected`, or `selector` — overriding a selector clears the
  shadow chain and marks quality = "manual".
- Step rows show a hover-revealed ⋯ menu with Edit (opens
  StepEditDialog) and Delete (confirms, then removes). Navigate
  steps allow Delete but not Edit.
- `steps:changed` IPC broadcasts the fresh step list after any
  mutation so the renderer stays in sync without polling.

**Commits:**
- `0b323f4` feat(recorder): mutation API + assertion step kind
- `70a5d9e` feat(ui): per-step edit/delete + Add Assertion dialog

---

### US-25 — Navigable breadcrumb + Generate guardrail

**Title:** Breadcrumb segments actually navigate, and the Generate
/ Export actions stay disabled until recording is stopped

**Description:** Two small-but-real UX bugs reported together:

1. Breadcrumb rows *looked* like links (blue text, pointer) but
   clicking them did nothing.
2. Users were unsure whether to click Generate Script before or
   after Stop, because the primary action was always enabled.

**Acceptance:**
- Breadcrumb renders non-clickable segments as grey-600 plain
  text (no pointer, no hover underline) — visually distinct from
  a live link.
- "Recrd" and "Sessions" become real links only when the session
  is stopped (or absent); clicking closes the session and
  returns to startup, matching the "New Session" toolbar button.
- Primary Generate Script / Generate PDF and secondary Export
  Journey stay `disabled` while the REC chip is showing. Tooltip
  reads "Stop recording first".
- `AppBar`'s `ActionButton` now falls back to the label as tooltip
  when no explicit title is provided, so disabled buttons explain
  themselves on hover.

**Commits:**
- `2ae554d` fix(ui): functional breadcrumb + gate Generate/Export behind Stop

---

### US-24 — Narrative notes (comments in scripts, callouts in docs)

**Title:** Let users attach free-text notes to a recording; render
them as code comments in Script Gen and as orange callout cards in
Doc Gen

**Description:** The recorder only captures clicks / fills /
navigations, but writing a runnable doc or a well-commented test
often needs narrative — "verify this login CTA is wired up",
"locator is text-matched, replace with data-testid in prod", etc.
A dedicated note step lets users attach that context to a specific
page state.

Hijacking the embedded browser's right-click was considered but
rejected: it would break inspect / copy-link / normal web
behaviour. Instead: a toolbar button and a keyboard shortcut.

**Acceptance:**
- Recorder exposes `addNote(text)` which pushes a `note` step and
  schedules a `capturePage` so the note is anchored to a page
  screenshot.
- Browser toolbar gains an "Add Note" button (session active,
  recording or paused); Ctrl+Shift+N works globally in the
  window. Composer dialog: textarea, Esc cancels, Ctrl+Enter
  saves.
- Step panel renders notes on an orange-bg card with a note-book
  icon and italic first line; click to expand.
- Playwright / Cypress / Selenium codegen emit `// {text}` inline
  at the note's chronological position. Custom mapping gains a
  default `note: "// {text}"` which users can override.
- HTML / PDF walkthrough renders notes as a distinct orange
  callout card with the note text above the captured screenshot.
- Replay engine skips note kinds silently (they are not actions).

**Commits:**
- `d3b2ccb` feat(recorder): note step — narrative comments + doc callouts
- `7f0d908` feat(ui): Add Note button + composer + orange note rows

---

### US-23 — Offline / corporate-network installability

**Title:** Support installing the app on networks where Chromium
binary downloads are blocked

**Description:** `npm install` fetches the Electron Chromium
binary from GitHub releases, which is commonly blocked on
corporate or air-gapped networks. The project needs documented
escape hatches (mirror, cache, skip) and a template so a new
developer can be productive without asking IT about unblocking
GitHub.

**Acceptance:**
- README has a "Corporate networks / offline installs" section
  covering `ELECTRON_MIRROR`, `ELECTRON_CUSTOM_DIR`,
  `ELECTRON_CACHE`, and `ELECTRON_SKIP_BINARY_DOWNLOAD`.
- `.npmrc.example` checked in as a template with commented keys
  for the common cases.
- `.npmrc` git-ignored so per-developer mirror URLs don't leak.
- Documentation clarifies that once installed, the app needs no
  further Electron-related network access; only the recorded
  target URL traffic, which flows through the system proxy.

**Commits:**
- `8ee5181` docs: corporate-network + offline install instructions

---

### US-22 — PDF walkthrough with bounding-box annotations

**Title:** Generate a print-ready PDF user guide from a Doc Gen
recording, with the clicked element highlighted on each screenshot

**Description:** In Doc Gen mode a screenshot is taken after every
interactive step. Each screenshot is rendered in the report with a
CSS-drawn bounding box (plus an optional numbered callout badge)
positioned from the stored element rect + viewport. The report can
then be exported as HTML or printed to PDF. The unified Export dialog
handles both.

**Acceptance:**
- `recorder-script.js` enriches every snapshot with `rect` (element
  `getBoundingClientRect`) and `viewport` (`innerWidth`,
  `innerHeight`, `devicePixelRatio`) so annotation positions are
  always scale-correct.
- In Doc Gen sessions, `main.js` schedules a debounced
  `capturePage()` after each non-navigate step, resizes to 800 px
  wide, and attaches to the latest step without a shot. A
  `stepShotBusy` flag prevents parallel captures.
- HTML report template renders `<figure class="shot"><img><div
  class="bbox"><span class="callout">` using `%` coords computed
  from `rect / viewport`. Media query tightens spacing for print.
- New PDF pipeline: write the HTML to a temp file, load into a
  hidden BrowserWindow, `webContents.printToPDF({ pageSize: "A4",
  printBackground: true })`, write to the user's chosen path.
- Export dialog gets a `HTML / PDF` segmented toggle plus a
  "Numbered callouts" checkbox; the label on the primary button
  follows the selected format.

**Commits:**
- `69cb62c` feat(ui): record type toggle — Script Gen vs Doc Gen
- `6a98f97` feat(ui): format toggle and callouts option in export dialog

---

### US-21 — Record type toggle (Script Gen vs Doc Gen)

**Title:** Let the user pick *why* they are recording up front, so
capture cost and output both match the intent

**Description:** Script Gen and Doc Gen have different capture
economies: Script Gen only needs one screenshot per page visit, Doc
Gen wants one per click. Picking the mode on the startup screen
avoids always paying the heavier cost.

**Acceptance:**
- Startup screen shows a two-option radio above the framework
  picker: Script Gen (CODE badge) and Doc Gen (PDF badge).
- Framework picker and Custom mapping editor only render in
  Script Gen mode.
- Selected record type persists to settings and is carried
  through `recorder:start` IPC and the saved session.
- Primary AppBar action label + icon flip by mode: "Generate
  Script" (code icon) in Script Gen, "Generate PDF" (save icon)
  in Doc Gen. Secondary Export-Journey action stays available
  in both modes.

**Commits:**
- `69cb62c` feat(ui): record type toggle — Script Gen vs Doc Gen

---

### US-20 — Export user journey with screenshots

**Title:** Export a reviewable HTML user journey, one screenshot per
page visited, with per-step opt-in

**Description:** As a user I want to share a human-readable record of
what I did — steps with targets and an image of each distinct page I
saw — without needing the test framework output or the raw trace.

Screenshots could explode if taken per click, so we capture exactly
one per navigation (the page as it finished loading). The export
dialog lets me opt individual steps in or out before saving.

**Acceptance:**
- Main process hooks `did-finish-load` and `did-navigate-in-page`
  on the embedded browser, debounces 400 ms, calls
  `capturePage()`, resizes to 800 px wide, attaches a data URL to
  the most recent navigate step that does not yet have one.
- App bar gains a secondary "Export Journey" button left of the
  primary Generate Script button (disabled until there are steps).
- Journey export dialog lists every step with a checkbox, Select
  all / Select none toggles, and a "screenshot" chip where an image
  is attached.
- `journey:export` renders a self-contained HTML report (inline
  base64 images, Google-style tokens) and writes it via
  `dialog.showSaveDialog`.

**Commits:**
- `1695ed5` feat(recorder): capture one screenshot per page visit
- `d0d8b94` feat(ui): Export Journey button and opt-in/out dialog

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
