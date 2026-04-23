"use strict";

const path = require("node:path");
const fs = require("node:fs");
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
  view.webContents.loadURL(initialUrl);
  return view;
}

function emitToRenderer(channel, payload) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  state.mainWindow.webContents.send(channel, payload);
}

async function startRecording(options) {
  const settings = getSettings();
  const url = options?.url || settings.lastUrl || "about:blank";
  setSettings({ lastUrl: url, framework: options?.framework || settings.framework });
  createBrowserView(url);
  const recorder = new DebuggerRecorder(state.browserView.webContents, {
    captureSensitive: Boolean(options?.captureSensitive ?? settings.captureSensitive),
    target: options?.framework || settings.framework,
    customMapping: settings.customMapping
  });
  state.recorder = recorder;
  state.session = {
    id: newId(),
    startedAt: Date.now(),
    framework: options?.framework || settings.framework,
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

  ipcMain.handle("shell:open-external", (_e, url) => {
    try { shell.openExternal(url); return { ok: true }; } catch (err) { return { ok: false, error: String(err) }; }
  });
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
