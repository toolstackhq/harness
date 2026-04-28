<p align="center">
  <img src="assets/icon.png" width="120" />
</p>

<h1 align="center">Harness</h1>

<p align="center">
  <strong>Record once. Ship a script or a doc. Replay forever.</strong>
</p>

<p align="center">
  <a href="https://github.com/toolstackhq/harness/stargazers"><img src="https://img.shields.io/github/stars/toolstackhq/harness?style=flat&color=yellow" alt="Stars"></a>
  <a href="https://github.com/toolstackhq/harness/commits/main"><img src="https://img.shields.io/github/last-commit/toolstackhq/harness?style=flat" alt="Last commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#install">Install</a> •
  <a href="#what-it-does">What it does</a> •
  <a href="#export-menu">Export menu</a> •
  <a href="#frameworks">Frameworks</a> •
  <a href="#dynamic-values">Dynamic values</a> •
  <a href="#selector-only-export">Selector export</a> •
  <a href="#llm-prompt-export">LLM prompt</a> •
  <a href="#inspector">Inspector</a> •
  <a href="#replay">Replay</a> •
  <a href="#folders">Folders</a>
</p>

---

Click around in a real browser. Harness watches via CDP and turns the
session into a runnable test script or an annotated walkthrough doc.
Replay it whenever you want to check the flow still works.

> 🤖 **Record once, hand it to any LLM.** Pick framework + language + your
> LLM, click **Copy to clipboard**, paste into Claude / GPT / Gemini.
> Get back a runnable test for any framework, even ones Harness doesn't
> ship.
>
> <details>
> <summary><strong>Click for a real generated prompt</strong></summary>
>
> ```
> You are Claude. Reason carefully but keep the final code production-quality, idiomatic, and minimal.
> You are also a senior test automation specialist.
>
> # Task
> Convert the recorded user flow below into a runnable **WebdriverIO** test, written in **TypeScript**.
>
> ## Project context
> - This will land in an **existing test suite**. Assume the framework, runner, base URL config, fixtures, helpers and folder convention are already set up.
> - Do NOT regenerate package.json, framework config, tsconfig, .env, or CI workflows. Do not change any existing file unless strictly necessary.
> - Match whatever Page Object / fixture / data-builder pattern the existing suite uses if hinted in the notes below; otherwise stay close to the framework's idiomatic test shape.
> - Output a single new test file as one fenced block, prefixed with the suggested file path comment.
>
> ## Requirements
> - Use the exact selectors provided. Prefer the most stable form (id / data-testid / role) when there are alternatives.
> - Treat any value that looks like sample data (emails, names, account numbers) as a parameter. Hoist it to a constant or test parameter at the top of the file.
> - Add explicit waits for visibility / network idle where appropriate; do not insert blind sleeps unless the recorded flow had a wait step.
> - For shadow DOM selectors written as `host >> child`, translate them into the framework's pierce syntax (e.g. Playwright's `>>`, Cypress `.shadow().find()`, Selenium's JS executor).
> - Wrap the whole flow in a single test or describe block named after the recorded URL.
> - If the framework needs imports / driver bootstrap, generate them. If driver setup depends on the user's machine (Selenium-Java for instance), explicitly call that out as a comment.
> - Output only the final code in a fenced block, then a 2-3 line explanation. No marketing.
>
> ## Extra notes from the user
> Wrap interactions in a Page Object Model. Target staging only.
>
> ## Recorded flow
> 1. Navigate to `https://staging.example.com/login`.
> 2. Fill "Email" (selector: `#email`) with the value `alice@example.com`.
> 3. Fill "Password" (selector: `#password`) with the value `hunter2`.
> 4. Click on "Sign in" (selector: `button[type='submit']`).
> 5. Assert that "Welcome back" (selector: `.welcome`) is visible.
> 6. Click on "Account" (selector: `nav-bar >> #account-link`).
> 7. Assert that selector `[data-testid="balance"]` contains the text `$`.
>
> Return the test now.
> ```
>
> </details>

![Harness startup screen](assets/harness-startup.png)

## What it does

- Test scripts. Playwright, Cypress, Selenium (JavaScript), Selenium (Java), or your own custom template.
- Walkthroughs. Per-step screenshots exported as HTML, PDF, Markdown, WebM or MP4 with bullet-list slides per page.
- Element capture. Hover, click, get just that element. Mark up with pen, highlighter, shapes, text via `tui-image-editor`.
- Replay. Built-in CDP runner with per-step pass/fail and scroll-into-view on every action.
- Dynamic values. `{{random.email}}`, `{{random.uuid}}`, `{{timestamp}}` etc. Fresh value every replay, baked into exported scripts as runtime expressions. Add your own.
- Folders. Postman-style. Drag a recording onto a folder chip to file it. Filter, rename, delete.
- Selector-only export. CSV, JSON, YAML, or XML for object-repository workflows.
- LLM prompt export. Hand the recorded flow off to Claude / GPT / Gemini for any framework Harness doesn't ship directly.
- Inspector. Right-click any element in the embedded browser to see its selector plus a full attribute table.

## Install

```bash
git clone https://github.com/toolstackhq/harness.git
cd harness
npm install
npm run dev
```

`npm run dev` boots Vite + Electron with hot reload. For a packaged build:

```bash
npm run build:renderer
npm start
```

Sessions persist under `~/.config/Harness/`.

## Export menu

Open any saved session, hit **Export ▾**. Three categories:

- **Test script** — direct codegen for the framework saved with the session. Copy or save as a file.
- **Selectors** — CSV / JSON / YAML / XML for object-repository workflows.
- **LLM prompt** — opens a small dialog asking for framework, language, target LLM, and any extra notes. Output copies to clipboard or saves as `.txt`.

Walkthrough docs (HTML / PDF / Markdown / WebM / MP4) keep their own dialog from the active recording session toolbar.

## Frameworks

| Target | Language | Output snippet |
|--------|----------|----------------|
| Playwright | JavaScript or TypeScript | `await page.locator('#x').fill(EMAIL)` |
| Cypress | JavaScript or TypeScript | `cy.get('#x').clear().type(EMAIL)` |
| Selenium (JS) | JavaScript | `await driver.findElement(By.css('#x')).sendKeys(EMAIL)` |
| Selenium (Java) | Java | `el0.sendKeys(EMAIL);` snippet, no class wrapper |
| Custom | Whatever you map to | Your template, your placeholders |

The Java target generates the action body only. Driver setup, imports
and lifecycle stay your job because every machine is different.

## Dynamic values

In the step editor, click **Insert dynamic value**. Pick from the
labelled list. The token gets inserted at the cursor and translated
into runtime code in whatever framework you export.

| Token | Replay value | JS export | Java export |
|-------|--------------|-----------|-------------|
| `{{random.number}}` | `4827193` | `Array.from({length:7},...)` | `String.format("%07d", ThreadLocalRandom...)` |
| `{{random.alpha:8}}` | `qjflxzpr` | inline 26-char picker | `IntStream.range...joining` |
| `{{random.uuid}}` | `f81d4fae-...` | `crypto.randomUUID()` | `UUID.randomUUID().toString()` |
| `{{random.email}}` | `user_<ts>_<n>@example.com` | template literal | string concat |
| `{{timestamp}}` | `1714045932148` | `String(Date.now())` | `String.valueOf(System.currentTimeMillis())` |
| `{{date.iso}}` | `2026-04-27T09:32:12.148Z` | `new Date().toISOString()` | `Instant.now().toString()` |

### Add your own tokens

Edit `~/.config/Harness/harness-settings.json`:

```json
{
  "customTokens": [
    {
      "name": "myAccount",
      "label": "My test account",
      "desc": "Cycles through 3 fixed account numbers",
      "js": "['ACC-100','ACC-200','ACC-300'][Math.floor(Math.random()*3)]",
      "java": "java.util.List.of(\"ACC-100\",\"ACC-200\",\"ACC-300\").get(java.util.concurrent.ThreadLocalRandom.current().nextInt(3))"
    }
  ]
}
```

`js` runs at replay time and is also embedded verbatim into exported
JavaScript scripts. `java` is embedded verbatim into Selenium-Java
exports. Either field is optional. Custom tokens show up at the top
of the picker on next dialog open.

## Selector-only export

Some teams keep a separate object-repository file. Open a saved
session → **Export selectors** → pick CSV / JSON / YAML / XML.

Example CSV:

```
name,selector
username_input,#username
password_input,#password
sign_in_button,button[type="submit"]
```

Names are derived from the locator label, name, aria-label,
placeholder, text, id, or data-testid, then suffixed with the action
kind. Duplicates get numeric suffixes.

## LLM prompt export

For frameworks Harness doesn't ship (WebdriverIO, TestCafe, Robot,
Cucumber, Appium, k6, custom in-house runners), record the flow then
**Export ▾ → Build LLM prompt…**. Pick:

- **Target framework** — Playwright, Cypress, Selenium, WebdriverIO, TestCafe, Robot, k6, Cucumber + WebDriver, Appium, or Custom (free-text description)
- **Language** — JavaScript, TypeScript, Java, Python, C#, Ruby, Go
- **Target LLM** — Claude, ChatGPT, Gemini, or generic
- **Where will this run?** — *Add to an existing test suite* (LLM stays in lane, single test file, no package.json edits) or *Generate a fresh standalone project* (full scaffold: install commands, config, folder layout, runnable test file)
- **Extra notes** — free-text guidance (Page Object Model, parameterise these values, target staging only, etc)

Click **Copy to clipboard** or **Save as .txt**. The prompt looks like:

```
You are Claude. Reason carefully but keep the final code production-quality, idiomatic, and minimal.
You are also a senior test automation specialist.

# Task
Convert the recorded user flow below into a runnable **Playwright** test, written in **TypeScript**.

## Requirements
- Use the exact selectors provided. Prefer the most stable form (id / data-testid / role) when there are alternatives.
- Treat any value that looks like sample data (emails, names, account numbers) as a parameter…
- Add explicit waits for visibility / network idle where appropriate; do not insert blind sleeps unless the recorded flow had a wait step.
- For shadow DOM selectors written as `host >> child`, translate them into the framework's pierce syntax…
- Wrap the whole flow in a single test or describe block named after the recorded URL.
- Output only the final code in a fenced block, then a 2-3 line explanation. No marketing.

## Recorded flow
1. Navigate to `https://example.com/login`.
2. Fill "Email" (selector: `#email`) with the value `alice@example.com`.
3. Fill "Password" (selector: `#password`) with the value `hunter2`.
4. Click on "Sign in" (selector: `button[type='submit']`).
5. Assert that selector `.welcome` is visible.

Return the test now.
```

Paste straight into your LLM. Same recording, infinite frameworks.

## Inspector

Inspect mode opens a live browser session with no recording. Right-click
any element on the page. The side panel shows:

- the picked selector (with shadow DOM `>>` chain when relevant)
- a full attribute table including `id`, classes, `role`, `type`,
  `checked` / `disabled` / `readonly`, computed visibility, value,
  text content, bounding rect and every other DOM attribute

Useful for verifying selectors before adding them to a script, or
constructing more reliable locators by hand.

## Replay

Hit **Replay**. Harness wipes browser state, navigates to the recorded
URL fresh, then walks every step. Each action scrolls the target into
view, highlights it, fires the real input events. Pass/fail shows up
next to each step in the side panel.

Replay also runs after recording stops without rebooting the session,
so you can record then immediately verify.

## Folders

Drag a session row onto a folder chip. Drop on **Unfiled** to clear
the folder. Click **+ New folder** to add one. Filter by clicking a
chip. The recent-sessions list scrolls when it grows beyond the
session config panel.

## Tests

```bash
npm test
```

61+ unit and integration tests across recorder, replay engine, codegen
(all five targets), and locator builder. Run on every commit.

## License

[MIT](LICENSE).
