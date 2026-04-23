"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, clipboard, Menu, nativeImage } = require("electron");
const { DebuggerRecorder } = require("./recorder/recorder.js");
const { generateCode } = require("./recorder/codegen.js");
const { replaySteps, QS_DEEP } = require("./recorder/replayEngine.js");

const IS_DEV = process.env.NODE_ENV === "development";
const RENDERER_URL = IS_DEV
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "renderer-dist/index.html")}`;

const SETTINGS_PATH = path.join(app.getPath("userData"), "recrd-settings.json");
const SESSIONS_PATH = path.join(app.getPath("userData"), "recrd-sessions.json");
const ICON_PATH = path.join(__dirname, "assets", "icon.png");
const MAX_SESSIONS = 20;

const state = {
  mainWindow: null,
  browserView: null,
  recorder: null,
  session: null,
  browserBounds: { x: 0, y: 0, width: 800, height: 600 },
  browserHidden: false,
  replayRunning: false,
  replayAbort: null
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
  } catch (err) {
    console.error("writeJson failed:", err);
  }
}

function getSettings() {
  const defaults = {
    recordType: "script",
    framework: "playwright",
    customMapping: {
      navigate: "await this.goTo('{url}')",
      click: "await this.clickElement('{selector}')",
      fill: "await this.typeInto('{selector}', '{value}')",
      select: "await this.selectOption('{selector}', '{value}')",
      check: "await this.setChecked('{selector}', {checked})",
      press: "await this.press('{selector}', '{key}')",
      submit: "await this.submit('{selector}')"
    },
    captureSensitive: false,
    lastUrl: "https://example.com"
  };
  return { ...defaults, ...readJson(SETTINGS_PATH, {}) };
}

function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJson(SETTINGS_PATH, next);
  return next;
}

function loadSessions() {
  const list = readJson(SESSIONS_PATH, []);
  return Array.isArray(list) ? list : [];
}

function writeSessions(list) {
  writeJson(SESSIONS_PATH, list.slice(0, MAX_SESSIONS));
}

function saveSession(entry) {
  const list = loadSessions();
  list.unshift(entry);
  writeSessions(list);
  return list;
}

function updateSession(id, patch) {
  const list = loadSessions();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  writeSessions(list);
  return list[idx];
}

function deleteSession(id) {
  const list = loadSessions().filter((s) => s.id !== id);
  writeSessions(list);
  return list;
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createMainWindow() {
  const icon = nativeImage.createFromPath(ICON_PATH);
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#f8f9fa",
    title: "Recrd",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadURL(RENDERER_URL);
  if (IS_DEV) win.webContents.openDevTools({ mode: "detach" });
  win.on("resize", () => repositionBrowser());
  win.on("closed", () => {
    if (state.browserView) {
      try { destroyBrowserView(); } catch {}
    }
    state.mainWindow = null;
  });
  state.mainWindow = win;
  Menu.setApplicationMenu(null);
  return win;
}

function repositionBrowser() {
  if (!state.browserView || !state.mainWindow) return;
  if (state.browserHidden) {
    state.browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const b = state.browserBounds;
  state.browserView.setBounds({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(0, Math.round(b.width)),
    height: Math.max(0, Math.round(b.height))
  });
}

function destroyBrowserView() {
  if (!state.browserView) return;
  const view = state.browserView;
  state.browserView = null;
  try {
    if (state.mainWindow) state.mainWindow.contentView.removeChildView(view);
  } catch {}
  try { view.webContents.close(); } catch {}
}

function createBrowserView(initialUrl) {
  if (state.browserView) destroyBrowserView();
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  state.browserView = view;
  state.mainWindow.contentView.addChildView(view);
  repositionBrowser();
  view.webContents.on("did-navigate", (_e, url) => {
    emitToRenderer("browser:url-changed", { url });
  });
  view.webContents.on("did-navigate-in-page", (_e, url) => {
    emitToRenderer("browser:url-changed", { url });
  });
  view.webContents.on("page-title-updated", (_e, title) => {
    emitToRenderer("browser:title-changed", { title });
  });
  view.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    emitToRenderer("browser:load-failed", { url: validatedURL, description: errorDescription });
  });
  let shotTimer = null;
  const scheduleShot = () => {
    if (shotTimer) clearTimeout(shotTimer);
    shotTimer = setTimeout(async () => {
      if (!state.recorder || !state.browserView || state.browserView !== view) return;
      try {
        const image = await view.webContents.capturePage();
        if (image.isEmpty()) return;
        const resized = image.resize({ width: 800 });
        const dataUrl = resized.toDataURL();
        const updated = state.recorder.attachLatestNavigateScreenshot(dataUrl);
        if (updated) emitToRenderer("step:screenshot", { dataUrl });
      } catch (err) {
        console.warn("capturePage failed:", err?.message || err);
      }
    }, 400);
  };
  view.webContents.on("did-finish-load", scheduleShot);
  view.webContents.on("did-navigate-in-page", scheduleShot);
  view.webContents.loadURL(initialUrl);
  return view;
}

let stepShotBusy = false;
let stepShotPending = false;
async function scheduleStepCapture() {
  if (!state.recorder || !state.browserView) return;
  if (stepShotBusy) { stepShotPending = true; return; }
  stepShotBusy = true;
  await new Promise((r) => setTimeout(r, 350));
  try {
    const image = await state.browserView.webContents.capturePage();
    if (!image.isEmpty()) {
      const dataUrl = image.resize({ width: 800 }).toDataURL();
      const updated = state.recorder.attachLatestStepScreenshot(dataUrl);
      if (updated) emitToRenderer("step:screenshot", { dataUrl });
    }
  } catch (err) {
    console.warn("scheduleStepCapture failed:", err?.message || err);
  } finally {
    stepShotBusy = false;
    if (stepShotPending) {
      stepShotPending = false;
      scheduleStepCapture();
    }
  }
}

function emitToRenderer(channel, payload) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  state.mainWindow.webContents.send(channel, payload);
}

async function startRecording(options) {
  const settings = getSettings();
  const url = options?.url || settings.lastUrl || "about:blank";
  const recordType = options?.recordType || settings.recordType || "script";
  setSettings({
    lastUrl: url,
    framework: options?.framework || settings.framework,
    recordType
  });
  createBrowserView(url);
  const recorder = new DebuggerRecorder(state.browserView.webContents, {
    captureSensitive: Boolean(options?.captureSensitive ?? settings.captureSensitive),
    target: options?.framework || settings.framework,
    customMapping: settings.customMapping,
    recordType
  });
  state.recorder = recorder;
  state.session = {
    id: newId(),
    startedAt: Date.now(),
    framework: options?.framework || settings.framework,
    recordType,
    url,
    recording: true,
    stopped: false,
    historyId: null
  };
  recorder.on("step", (step) => {
    emitToRenderer("step:recorded", {
      step,
      stepCount: recorder.stepCount,
      shadowCount: recorder.shadowCount,
      warningCount: recorder.warningCount
    });
    if (recordType === "doc" && step.kind !== "navigate") {
      scheduleStepCapture();
    }
  });
  recorder.on("cleared", () => emitToRenderer("recorder:cleared", {}));
  recorder.on("error", (err) => emitToRenderer("recorder:error", { message: String(err?.message || err) }));
  recorder.on("detached", (reason) => emitToRenderer("recorder:detached", { reason }));
  try {
    await recorder.start();
    emitToRenderer("recorder:started", { url, framework: state.session.framework });
    return { ok: true, url, framework: state.session.framework };
  } catch (err) {
    destroyBrowserView();
    state.recorder = null;
    state.session = null;
    return { ok: false, error: String(err?.message || err) };
  }
}

function persistCurrentSession({ generatedScript } = {}) {
  if (!state.recorder || !state.session) return null;
  const steps = state.recorder.getSteps();
  const entry = {
    id: state.session.historyId || newId(),
    timestamp: state.session.startedAt || Date.now(),
    url: state.session.url,
    framework: state.session.framework,
    recordType: state.session.recordType || "script",
    stepCount: steps.length,
    steps,
    generatedScript: generatedScript ?? null
  };
  if (state.session.historyId) {
    updateSession(state.session.historyId, entry);
  } else {
    saveSession(entry);
    state.session.historyId = entry.id;
  }
  return entry;
}

async function pauseRecording() {
  if (!state.recorder || !state.session) return { ok: true };
  state.recorder.pause();
  state.session.recording = false;
  state.session.stopped = true;
  const saved = persistCurrentSession();
  emitToRenderer("recorder:stopped", { historyId: saved?.id, stepCount: saved?.stepCount || 0 });
  return { ok: true, historyId: saved?.id };
}

async function closeSession() {
  if (state.replayAbort) {
    try { state.replayAbort.abort(); } catch (_) {}
    state.replayAbort = null;
  }
  if (state.recorder) {
    try { await state.recorder.stop(); } catch (_) {}
  }
  state.recorder = null;
  destroyBrowserView();
  state.session = null;
  state.replayRunning = false;
  emitToRenderer("session:closed", {});
  return { ok: true };
}

function clearSteps() {
  if (!state.recorder) return { ok: true };
  state.recorder.clear();
  return { ok: true };
}

async function runReplay(steps) {
  if (state.replayRunning) return { ok: false, error: "Replay already running" };
  if (!state.browserView) return { ok: false, error: "No browser session" };
  const dbg = state.browserView.webContents.debugger;
  if (!dbg.isAttached()) {
    try { dbg.attach("1.3"); } catch (err) { return { ok: false, error: String(err?.message || err) }; }
  }
  try { await dbg.sendCommand("Page.enable"); } catch (_) {}
  try { await dbg.sendCommand("Runtime.enable"); } catch (_) {}
  try { await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: QS_DEEP }); } catch (_) {}

  state.replayRunning = true;
  const controller = new AbortController();
  state.replayAbort = controller;
  emitToRenderer("replay:started", { total: steps.length });
  try {
    const results = await replaySteps(steps, dbg, {
      signal: controller.signal,
      onStep: (entry) => {
        if (entry.status === "pass") emitToRenderer("replay:step:pass", entry);
        else emitToRenderer("replay:step:fail", entry);
      }
    });
    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.length - passed;
    emitToRenderer("replay:complete", { results, passed, failed, total: results.length });
    return { ok: true, results, passed, failed };
  } catch (err) {
    const message = String(err?.message || err);
    emitToRenderer("replay:complete", { results: [], passed: 0, failed: 0, total: 0, error: message });
    return { ok: false, error: message };
  } finally {
    state.replayRunning = false;
    state.replayAbort = null;
  }
}

async function startReplayOnlySession({ url, steps, framework }) {
  await closeSession();
  createBrowserView(url);
  const settings = getSettings();
  const recorder = new DebuggerRecorder(state.browserView.webContents, {
    target: framework,
    customMapping: settings.customMapping
  });
  recorder.paused = true;
  recorder.loadSteps(steps || [], { url, targetId: "loaded" });
  state.recorder = recorder;
  state.session = {
    id: newId(),
    startedAt: Date.now(),
    framework,
    url,
    recording: false,
    stopped: true,
    historyId: null,
    replayOnly: true
  };
  emitToRenderer("session:replay-loaded", {
    session: { ...state.session },
    steps
  });
  await new Promise((resolve) => {
    const wc = state.browserView.webContents;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    wc.once("did-finish-load", finish);
    wc.once("did-fail-load", finish);
    setTimeout(finish, 12000);
  });
  return runReplay(steps);
}

function registerIpc() {
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_e, patch) => setSettings(patch || {}));

  ipcMain.handle("recorder:start", (_e, options) => startRecording(options || {}));
  ipcMain.handle("recorder:stop", () => pauseRecording());
  ipcMain.handle("recorder:close", () => closeSession());
  ipcMain.handle("recorder:clear", () => clearSteps());
  ipcMain.handle("recorder:add-note", async (_e, text) => {
    if (!state.recorder || !state.session) return { ok: false, error: "No active session" };
    const trimmed = String(text || "").trim();
    if (!trimmed) return { ok: false, error: "Empty note" };
    const url = state.browserView ? state.browserView.webContents.getURL() : state.session.url;
    state.recorder.addNote(trimmed, { url });
    scheduleStepCapture();
    return { ok: true };
  });
  ipcMain.handle("recorder:delete-step", (_e, number) => {
    if (!state.recorder) return { ok: false, error: "No active session" };
    const removed = state.recorder.deleteStepByNumber(number);
    const steps = state.recorder.getSteps();
    emitToRenderer("steps:changed", { steps });
    return { ok: removed, steps };
  });
  ipcMain.handle("recorder:update-step", (_e, { number, patch }) => {
    if (!state.recorder) return { ok: false, error: "No active session" };
    const updated = state.recorder.updateStepByNumber(number, patch || {});
    if (!updated) return { ok: false, error: "Step not found" };
    const steps = state.recorder.getSteps();
    emitToRenderer("steps:changed", { steps });
    return { ok: true, steps, step: updated };
  });
  ipcMain.handle("recorder:add-assertion", (_e, payload) => {
    if (!state.recorder || !state.session) return { ok: false, error: "No active session" };
    const { selector, assertionType, expected } = payload || {};
    if (!selector || !String(selector).trim()) return { ok: false, error: "Selector required" };
    state.recorder.addAssertion({
      selector: String(selector).trim(),
      assertionType: assertionType || "visible",
      expected: expected ?? ""
    });
    const steps = state.recorder.getSteps();
    return { ok: true, steps };
  });
  ipcMain.handle("recorder:state", () => {
    if (!state.recorder) return { recording: false };
    return {
      recording: state.session?.recording || false,
      stopped: state.session?.stopped || false,
      url: state.session?.url,
      framework: state.session?.framework,
      startedAt: state.session?.startedAt,
      historyId: state.session?.historyId,
      stepCount: state.recorder.stepCount,
      shadowCount: state.recorder.shadowCount,
      warningCount: state.recorder.warningCount
    };
  });

  ipcMain.handle("browser:set-bounds", (_e, bounds) => {
    state.browserBounds = { ...state.browserBounds, ...bounds };
    repositionBrowser();
    return { ok: true };
  });
  ipcMain.handle("browser:set-visible", (_e, visible) => {
    state.browserHidden = !visible;
    repositionBrowser();
    return { ok: true };
  });
  ipcMain.handle("browser:navigate", (_e, url) => {
    if (!state.browserView) return { ok: false };
    state.browserView.webContents.loadURL(url);
    return { ok: true };
  });
  ipcMain.handle("browser:back", () => {
    if (!state.browserView) return { ok: false };
    const wc = state.browserView.webContents;
    if (wc.canGoBack()) wc.goBack();
    return { ok: true };
  });
  ipcMain.handle("browser:forward", () => {
    if (!state.browserView) return { ok: false };
    const wc = state.browserView.webContents;
    if (wc.canGoForward()) wc.goForward();
    return { ok: true };
  });
  ipcMain.handle("browser:reload", () => {
    if (!state.browserView) return { ok: false };
    state.browserView.webContents.reload();
    return { ok: true };
  });

  ipcMain.handle("script:generate", (_e, options) => {
    try {
      const settings = getSettings();
      const target = options?.framework || state.session?.framework || settings.framework;
      const mapping = options?.mapping || settings.customMapping;
      const steps = state.recorder ? state.recorder.getSteps() : [];
      if (!steps.length) return { ok: false, error: "No steps recorded yet" };
      const traces = state.recorder.getTraces();
      const code = generateCode(traces, { target, mapping });
      if (state.session) persistCurrentSession({ generatedScript: code });
      return { ok: true, code, framework: target };
    } catch (err) {
      console.error("[generate] failed:", err);
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("script:save", async (_e, { code, framework }) => {
    const ext = framework === "cypress" ? "cy.js" : framework === "selenium" ? "js" : framework === "custom" ? "js" : "spec.js";
    const win = state.mainWindow;
    const result = await dialog.showSaveDialog(win, {
      title: "Save generated script",
      defaultPath: `recorded-flow.${ext}`,
      filters: [{ name: "JavaScript", extensions: ["js", "ts", "cjs", "mjs"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, code || "", "utf8");
    return { ok: true, path: result.filePath };
  });
  ipcMain.handle("script:copy", (_e, code) => {
    clipboard.writeText(code || "");
    return { ok: true };
  });

  ipcMain.handle("replay:start", async () => {
    if (!state.recorder) return { ok: false, error: "No active session" };
    const steps = state.recorder.getSteps();
    return runReplay(steps);
  });
  ipcMain.handle("replay:abort", () => {
    if (state.replayAbort) {
      try { state.replayAbort.abort(); } catch (_) {}
    }
    return { ok: true };
  });

  ipcMain.handle("sessions:load", () => loadSessions());
  ipcMain.handle("sessions:delete", (_e, id) => deleteSession(id));
  ipcMain.handle("sessions:generate", (_e, id) => {
    const settings = getSettings();
    const list = loadSessions();
    const sess = list.find((s) => s.id === id);
    if (!sess) return { ok: false, error: "Session not found" };
    const code = generateCode({ traces: [{ url: sess.url, title: "", events: sess.steps }] }, {
      target: sess.framework,
      mapping: settings.customMapping
    });
    const updated = updateSession(id, { generatedScript: code });
    return { ok: true, code, session: updated };
  });
  ipcMain.handle("sessions:save-file", async (_e, { script, filename }) => {
    const win = state.mainWindow;
    const result = await dialog.showSaveDialog(win, {
      title: "Save session script",
      defaultPath: filename || "session.spec.js",
      filters: [{ name: "JavaScript", extensions: ["js", "ts", "cjs", "mjs"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, script || "", "utf8");
    return { ok: true, path: result.filePath };
  });
  ipcMain.handle("sessions:replay", async (_e, id) => {
    const sess = loadSessions().find((s) => s.id === id);
    if (!sess) return { ok: false, error: "Session not found" };
    return startReplayOnlySession({ url: sess.url, steps: sess.steps || [], framework: sess.framework });
  });

  ipcMain.handle("journey:get-steps", () => {
    if (!state.recorder) return { ok: false, steps: [] };
    return { ok: true, steps: state.recorder.getSteps(), session: state.session };
  });

  ipcMain.handle("journey:export", async (_e, { indices, title, format, callouts }) => {
    if (!state.recorder) return { ok: false, error: "No active session" };
    const all = state.recorder.getSteps();
    const selection = Array.isArray(indices) ? indices : all.map((_, i) => i);
    const steps = selection
      .map((i) => ({ index: i, step: all[i] }))
      .filter((e) => e.step);
    if (!steps.length) return { ok: false, error: "No steps selected" };
    const meta = {
      url: state.session?.url || "",
      framework: state.session?.framework || "",
      startedAt: state.session?.startedAt || Date.now(),
      title: title || state.session?.url || "User journey",
      callouts: callouts !== false
    };
    const html = renderJourneyHtml(steps, meta);
    const stamp = new Date(meta.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fmt = format === "pdf" ? "pdf" : "html";
    const ext = fmt;
    const filter = fmt === "pdf"
      ? { name: "PDF", extensions: ["pdf"] }
      : { name: "HTML", extensions: ["html", "htm"] };
    const saveResult = await dialog.showSaveDialog(state.mainWindow, {
      title: fmt === "pdf" ? "Export walkthrough PDF" : "Export user journey",
      defaultPath: `journey-${stamp}.${ext}`,
      filters: [filter]
    });
    if (saveResult.canceled || !saveResult.filePath) return { ok: false };
    if (fmt === "html") {
      fs.writeFileSync(saveResult.filePath, html, "utf8");
      return { ok: true, path: saveResult.filePath };
    }
    try {
      const buffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, buffer);
      return { ok: true, path: saveResult.filePath };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("shell:open-external", (_e, url) => {
    try { shell.openExternal(url); return { ok: true }; } catch (err) { return { ok: false, error: String(err) }; }
  });
}

async function renderHtmlToPdf(html) {
  const tmp = path.join(os.tmpdir(), `recrd-walkthrough-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(tmp, html, "utf8");
  const pdfWin = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  try {
    await pdfWin.loadFile(tmp);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const buffer = await pdfWin.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });
    return buffer;
  } finally {
    try { pdfWin.destroy(); } catch (_) {}
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function describeStep(step) {
  const loc = step.locator || {};
  const label = loc.label || loc.name || loc.text || loc.css || step.element?.tag || step.kind;
  if (step.kind === "note") return { action: "Note", target: step.text || "" };
  if (step.kind === "assert") {
    const t = step.assertionType || "visible";
    const sel = loc.css || loc.xpath || label;
    const exp = step.expected ?? "";
    const phrase = {
      visible: "is visible",
      hidden: "is hidden",
      text: `has text "${exp}"`,
      contains: `contains "${exp}"`,
      value: `has value "${exp}"`
    }[t] || t;
    return { action: `Expect ${sel} ${phrase}`, target: sel };
  }
  if (step.kind === "navigate") return { action: "Navigate", target: step.url || "" };
  if (step.kind === "fill") return { action: "Fill", target: label, value: step.value ?? "" };
  if (step.kind === "check") return { action: step.checked ? "Check" : "Uncheck", target: label };
  if (step.kind === "select") return { action: "Select", target: label, value: step.value ?? "" };
  if (step.kind === "press") return { action: `Press ${step.key || "Enter"}`, target: label };
  if (step.kind === "submit") return { action: "Submit", target: label };
  if (step.kind === "click") return { action: "Click", target: label };
  return { action: step.kind, target: label };
}

function renderJourneyHtml(selection, meta) {
  const when = new Date(meta.startedAt).toLocaleString();
  const title = escapeHtml(meta.title);
  const callouts = meta.callouts !== false;
  const rows = selection.map(({ index, step }, i) => {
    const num = String(i + 1).padStart(2, "0");
    if (step.kind === "note") {
      const shot = step.screenshot
        ? `<figure class="shot"><img src="${step.screenshot}" alt="Note context screenshot" /></figure>`
        : "";
      const textHtml = escapeHtml(step.text || "").replace(/\n/g, "<br />");
      return `
      <section class="step step--note">
        <div class="num">${num}</div>
        <div class="body">
          <div class="headline">📝 Note</div>
          <div class="note-text">${textHtml}</div>
          ${shot}
        </div>
      </section>`;
    }
    if (step.kind === "assert") {
      const d = describeStep(step);
      const loc2 = step.locator || {};
      const sel2 = loc2.css || loc2.xpath || "";
      return `
      <section class="step step--assert">
        <div class="num">${num}</div>
        <div class="body">
          <div class="headline">✓ ${escapeHtml(d.action)}</div>
          <div class="row"><span class="k">Selector</span><code class="v">${escapeHtml(sel2)}</code></div>
        </div>
      </section>`;
    }
    const loc = step.locator || {};
    const chain = Array.isArray(loc.shadowChain) && loc.shadowChain.length
      ? loc.shadowChain.join(" » ") + " » "
      : "";
    const selector = step.kind === "navigate" ? "" : (loc.css || loc.xpath || "");
    const d = describeStep(step);

    let screenshotBlock = "";
    if (step.screenshot) {
      const rect = loc.rect;
      const viewport = loc.viewport;
      let overlay = "";
      if (step.kind !== "navigate" && rect && viewport && viewport.width && viewport.height) {
        const left = Math.max(0, (rect.x / viewport.width) * 100);
        const top = Math.max(0, (rect.y / viewport.height) * 100);
        const width = Math.max(1, (rect.width / viewport.width) * 100);
        const height = Math.max(1, (rect.height / viewport.height) * 100);
        overlay = `<div class="bbox" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%;">${callouts ? `<span class="callout">${num}</span>` : ""}</div>`;
      }
      screenshotBlock = `<figure class="shot"><img src="${step.screenshot}" alt="Screenshot for step ${num}" />${overlay}</figure>`;
    }

    const valueBlock = d.value !== undefined
      ? `<div class="row"><span class="k">Value</span><code class="v">${escapeHtml(JSON.stringify(d.value))}</code></div>`
      : "";
    const selectorBlock = selector
      ? `<div class="row"><span class="k">Selector</span><code class="v"><span class="chain">${escapeHtml(chain)}</span>${escapeHtml(selector)}</code></div>`
      : "";
    const targetBlock = `<div class="row"><span class="k">Target</span><span class="v">${escapeHtml(d.target)}</span></div>`;
    return `
      <section class="step">
        <div class="num">${num}</div>
        <div class="body">
          <div class="headline">${escapeHtml(d.action)}</div>
          ${targetBlock}
          ${selectorBlock}
          ${valueBlock}
          ${screenshotBlock}
        </div>
      </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    :root {
      --blue:#1a73e8; --blue-dark:#1557b0; --blue-light:#e8f0fe;
      --teal:#00796b; --teal-bg:#e0f2f1;
      --grey-50:#f8f9fa; --grey-100:#f1f3f4; --grey-200:#e8eaed;
      --grey-300:#dadce0; --grey-600:#80868b; --grey-700:#5f6368;
      --grey-800:#3c4043; --grey-900:#202124;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 20px;
      font: 14px/1.5 'Google Sans','Roboto',system-ui,sans-serif;
      color: var(--grey-900); background: var(--grey-50);
    }
    .wrap { max-width: 900px; margin: 0 auto; }
    header {
      background: white; border: 1px solid var(--grey-300); border-radius: 8px;
      padding: 20px 24px; margin-bottom: 20px;
    }
    h1 { font: 500 20px/1.3 inherit; margin: 0 0 8px; color: var(--grey-900); }
    .meta { font-size: 13px; color: var(--grey-700); display: flex; flex-wrap: wrap; gap: 16px; }
    .meta span { display: inline-flex; align-items: center; gap: 6px; }
    .chip {
      font: 500 11px/1 'Roboto Mono',monospace;
      padding: 4px 8px; border-radius: 10px; background: var(--blue-light); color: var(--blue-dark);
    }
    .step {
      background: white; border: 1px solid var(--grey-300); border-radius: 8px;
      padding: 16px 20px; margin-bottom: 12px;
      display: grid; grid-template-columns: 32px 1fr; gap: 16px;
    }
    .num {
      font: 500 13px/1 'Roboto Mono',monospace;
      color: var(--grey-600); padding-top: 2px; text-align: right;
    }
    .body { min-width: 0; }
    .headline { font-weight: 500; color: var(--grey-900); font-size: 15px; margin-bottom: 8px; }
    .row { display: flex; gap: 10px; margin-top: 6px; align-items: baseline; }
    .k {
      font-size: 11px; font-weight: 500; color: var(--grey-700);
      text-transform: uppercase; letter-spacing: 0.5px; width: 70px; flex-shrink: 0;
    }
    .v { font-size: 13px; color: var(--grey-800); word-break: break-word; min-width: 0; }
    code.v { font-family: 'Roboto Mono', monospace; font-size: 12px; background: var(--grey-100); padding: 2px 6px; border-radius: 3px; }
    .chain { color: var(--teal); }
    figure.shot {
      position: relative;
      margin: 12px 0 0; max-width: 800px;
    }
    figure.shot img {
      display: block; width: 100%;
      border: 1px solid var(--grey-300); border-radius: 4px;
    }
    .bbox {
      position: absolute;
      border: 2px dashed var(--blue);
      background: rgba(26,115,232,0.12);
      box-shadow: 0 0 0 2px rgba(26,115,232,0.15);
      border-radius: 3px;
      pointer-events: none;
    }
    .callout {
      position: absolute;
      left: -10px; top: -10px;
      min-width: 22px; height: 22px;
      padding: 0 6px;
      border-radius: 11px;
      background: var(--blue); color: white;
      font: 600 11px/22px 'Roboto Mono',monospace;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .step--note {
      background: var(--orange-bg);
      border-color: var(--orange);
    }
    .step--note .headline { color: var(--orange); }
    .step--assert {
      background: var(--green-bg);
      border-color: var(--green);
    }
    .step--assert .headline { color: var(--green); }
    .step--note .note-text {
      font-size: 14px;
      color: var(--grey-900);
      line-height: 1.55;
      margin: 8px 0 4px;
    }
    @media print {
      body { background: white; padding: 0; }
      header, .step { page-break-inside: avoid; break-inside: avoid; }
      .step { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${title}</h1>
      <div class="meta">
        <span>Recorded ${escapeHtml(when)}</span>
        <span>Framework <span class="chip">${escapeHtml(meta.framework.toUpperCase())}</span></span>
        <span>${selection.length} step${selection.length === 1 ? "" : "s"}</span>
      </div>
    </header>
    <main>
${rows}
    </main>
  </div>
</body>
</html>`;
}

app.whenReady().then(() => {
  try {
    app.setName("Recrd");
    if (process.platform === "linux") app.setAppUserModelId("com.recrd.app");
  } catch (_) {}
  registerIpc();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (contents === state.browserView?.webContents) {
      state.browserView.webContents.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
});
