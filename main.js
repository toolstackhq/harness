"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, clipboard, Menu, nativeImage } = require("electron");
const { DebuggerRecorder } = require("./recorder/recorder.js");
const { generateCode } = require("./recorder/codegen.js");
const { replaySteps, QS_DEEP } = require("./recorder/replayEngine.js");

const PICKER_SCRIPT = `
(() => {
  if (window.__harnessPickerInstalled) return;
  window.__harnessPickerInstalled = true;
  const cssEsc = (v) => (window.CSS && window.CSS.escape) ? window.CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  function leaf(el) {
    if (!el || !el.tagName) return "";
    const tid = el.getAttribute && (el.getAttribute("data-testid") || el.getAttribute("data-cy") || el.getAttribute("data-pw"));
    if (tid) return '[data-testid="' + tid.replace(/"/g, '\\\\"') + '"]';
    if (el.id) return "#" + cssEsc(el.id);
    const name = el.getAttribute && el.getAttribute("name");
    if (name) return '[name="' + name.replace(/"/g, '\\\\"') + '"]';
    const aria = el.getAttribute && el.getAttribute("aria-label");
    if (aria) return '[aria-label="' + aria.replace(/"/g, '\\\\"') + '"]';
    const tag = el.tagName.toLowerCase();
    if (el.parentElement) {
      const sibs = Array.from(el.parentElement.children).filter(s => s.tagName === el.tagName);
      const idx = sibs.indexOf(el) + 1;
      return tag + ":nth-of-type(" + idx + ")";
    }
    return tag;
  }
  function pickSelector(el) {
    const chain = [];
    let node = el;
    while (node) {
      const root = node.getRootNode && node.getRootNode();
      if (root && root.host) { chain.unshift(leaf(root.host)); node = root.host; }
      else break;
    }
    const tail = leaf(el);
    return chain.length ? chain.concat([tail]).join(" >> ") : tail;
  }
  document.addEventListener("contextmenu", (e) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    const target = path.find((n) => n instanceof Element);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const fn = globalThis.__harnessPick;
      if (typeof fn === "function") fn(JSON.stringify({ selector: pickSelector(target) }));
    } catch (_) {}
  }, true);
})();
`;

const IS_DEV = process.env.NODE_ENV === "development";
const RENDERER_URL = IS_DEV
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "renderer-dist/index.html")}`;

const SETTINGS_PATH = path.join(app.getPath("userData"), "harness-settings.json");
const SESSIONS_PATH = path.join(app.getPath("userData"), "harness-sessions.json");
const ICON_PATH = path.join(__dirname, "assets", "icon.png");
const MAX_SESSIONS = 20;

function migrateLegacyUserData() {
  try {
    const userData = app.getPath("userData");
    const legacyDir = path.join(path.dirname(userData), "recrd");
    const candidates = [
      { src: path.join(userData, "recrd-settings.json"), dst: SETTINGS_PATH },
      { src: path.join(legacyDir, "recrd-settings.json"), dst: SETTINGS_PATH },
      { src: path.join(legacyDir, "harness-settings.json"), dst: SETTINGS_PATH },
      { src: path.join(userData, "recrd-sessions.json"), dst: SESSIONS_PATH },
      { src: path.join(legacyDir, "recrd-sessions.json"), dst: SESSIONS_PATH },
      { src: path.join(legacyDir, "harness-sessions.json"), dst: SESSIONS_PATH }
    ];
    fs.mkdirSync(userData, { recursive: true });
    for (const { src, dst } of candidates) {
      if (fs.existsSync(dst)) continue;
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, dst);
      console.log("migrated", src, "->", dst);
    }
  } catch (err) {
    console.warn("migrateLegacyUserData:", err?.message || err);
  }
}

const VIEWPORTS = {
  desktop: { label: "Desktop", width: 1440, height: 900, mobile: false },
  tablet: { label: "Tablet", width: 768, height: 1024, mobile: true, ua: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1" },
  mobile: { label: "Mobile", width: 390, height: 844, mobile: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1" }
};

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
    viewport: "desktop",
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
    title: "Harness",
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
  win.on("close", async (e) => {
    if (_quitting) return;
    e.preventDefault();
    await gracefulShutdown();
    try { win.destroy(); } catch (_) {}
  });
  win.on("closed", () => {
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

async function applyEmulation(wc, viewportKey) {
  const v = VIEWPORTS[viewportKey] || VIEWPORTS.desktop;
  const dbg = wc.debugger;
  try {
    if (viewportKey === "desktop" || !v.mobile) {
      await dbg.sendCommand("Emulation.clearDeviceMetricsOverride");
      await dbg.sendCommand("Emulation.setUserAgentOverride", { userAgent: "" });
    } else {
      await dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: v.width,
        height: v.height,
        deviceScaleFactor: 2,
        mobile: v.mobile
      });
      if (v.ua) await dbg.sendCommand("Emulation.setUserAgentOverride", { userAgent: v.ua });
      await dbg.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: true });
    }
  } catch (err) {
    console.warn("applyEmulation:", err?.message || err);
  }
}

async function startInspect(options) {
  const settings = getSettings();
  const url = options?.url || settings.lastUrl || "about:blank";
  const viewport = options?.viewport || settings.viewport || "desktop";
  setSettings({ lastUrl: url, viewport, recordType: "inspect" });
  createBrowserView(url);
  state.recorder = null;
  state.session = {
    id: newId(),
    startedAt: Date.now(),
    name: null,
    framework: null,
    recordType: "inspect",
    viewport,
    url,
    recording: false,
    stopped: false,
    historyId: null,
    inspectOnly: true
  };
  try {
    const dbg = state.browserView.webContents.debugger;
    if (!dbg.isAttached()) dbg.attach("1.3");
    await dbg.sendCommand("Page.enable");
    await dbg.sendCommand("Runtime.enable");
    await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: QS_DEEP });
    await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: PICKER_SCRIPT });
    await dbg.sendCommand("Runtime.evaluate", { expression: PICKER_SCRIPT, awaitPromise: false });
    await dbg.sendCommand("Runtime.addBinding", { name: "__harnessPick" });
    if (state.inspectMessageHandler) {
      try { dbg.off("message", state.inspectMessageHandler); } catch (_) {}
    }
    state.inspectMessageHandler = (_event, method, params) => {
      if (method !== "Runtime.bindingCalled" || params?.name !== "__harnessPick") return;
      try {
        const data = JSON.parse(params.payload);
        if (data?.selector) emitToRenderer("inspector:picked", { selector: data.selector });
      } catch (_) {}
    };
    dbg.on("message", state.inspectMessageHandler);
    await applyEmulation(state.browserView.webContents, viewport);
  } catch (err) {
    console.warn("startInspect: setup failed:", err?.message || err);
  }
  emitToRenderer("recorder:started", { url, framework: null, viewport, recordType: "inspect" });
  return { ok: true, url, viewport, recordType: "inspect", framework: null };
}

async function startRecording(options) {
  const settings = getSettings();
  const url = options?.url || settings.lastUrl || "about:blank";
  const recordType = options?.recordType || settings.recordType || "script";
  const viewport = options?.viewport || settings.viewport || "desktop";
  setSettings({
    lastUrl: url,
    framework: options?.framework || settings.framework,
    recordType,
    viewport
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
    name: null,
    framework: options?.framework || settings.framework,
    recordType,
    viewport,
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
    await applyEmulation(state.browserView.webContents, viewport);
    emitToRenderer("recorder:started", { url, framework: state.session.framework });
    return { ok: true, url, framework: state.session.framework, viewport };
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
    name: state.session.name || null,
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
  if (state.inspectMessageHandler && state.browserView) {
    try { state.browserView.webContents.debugger.off("message", state.inspectMessageHandler); } catch (_) {}
  }
  state.inspectMessageHandler = null;
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
  const wc = state.browserView.webContents;
  const dbg = wc.debugger;
  if (!dbg.isAttached()) {
    try { dbg.attach("1.3"); } catch (err) { return { ok: false, error: String(err?.message || err) }; }
  }
  try { await dbg.sendCommand("Page.enable"); } catch (_) {}
  try { await dbg.sendCommand("Runtime.enable"); } catch (_) {}
  try { await dbg.sendCommand("Network.enable"); } catch (_) {}
  try { await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: QS_DEEP }); } catch (_) {}
  try {
    await wc.session.clearStorageData({
      storages: ["cookies", "localstorage", "serviceworkers", "indexdb", "websql", "cachestorage"]
    });
    await wc.session.clearCache();
  } catch (err) {
    console.warn("replay: clear state failed:", err?.message || err);
  }

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
    name: null,
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

  ipcMain.handle("recorder:start", (_e, options) => {
    if (options?.recordType === "inspect") return startInspect(options || {});
    return startRecording(options || {});
  });
  ipcMain.handle("recorder:stop", () => pauseRecording());
  ipcMain.handle("recorder:close", () => closeSession());
  ipcMain.handle("recorder:clear", () => clearSteps());
  ipcMain.handle("recorder:toggle-pause", () => {
    if (!state.recorder || !state.session) return { ok: false };
    if (state.recorder.paused) {
      state.recorder.resume();
      emitToRenderer("recorder:resumed", {});
    } else {
      state.recorder.pause();
      emitToRenderer("recorder:paused", {});
    }
    return { ok: true, paused: state.recorder.paused };
  });
  ipcMain.handle("recorder:add-wait", (_e, ms) => {
    if (!state.recorder || !state.session) return { ok: false, error: "No active session" };
    const n = Math.max(0, Number(ms) || 0);
    if (!n) return { ok: false, error: "Enter a positive number of milliseconds" };
    state.recorder.addWait(n);
    return { ok: true };
  });
  ipcMain.handle("recorder:insert-wait-after", (_e, { number, ms }) => {
    if (!state.recorder || !state.session) return { ok: false, error: "No active session" };
    const n = Math.max(0, Number(ms) || 0);
    if (!n) return { ok: false, error: "Enter a positive number of milliseconds" };
    const ev = state.recorder.insertWaitAfterNumber(number, n);
    if (!ev) return { ok: false, error: "Step not found" };
    const steps = state.recorder.getSteps();
    emitToRenderer("steps:changed", { steps });
    return { ok: true, steps };
  });
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
  ipcMain.handle("capture:snapshot", async () => {
    if (!state.browserView) return { ok: false, error: "No browser view" };
    try {
      const image = await state.browserView.webContents.capturePage();
      if (image.isEmpty()) return { ok: false, error: "Empty capture" };
      const dataUrl = image.resize({ width: 1200 }).toDataURL();
      return { ok: true, dataUrl, url: state.browserView.webContents.getURL() };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle("inspector:highlight", async (_e, selector) => {
    if (!state.browserView) return { ok: false, error: "No browser session" };
    const dbg = state.browserView.webContents.debugger;
    if (!dbg.isAttached()) {
      try { dbg.attach("1.3"); } catch (err) { return { ok: false, error: String(err?.message || err) }; }
    }
    try { await dbg.sendCommand("Runtime.enable"); } catch (_) {}
    try { await dbg.sendCommand("Runtime.evaluate", { expression: QS_DEEP, awaitPromise: false }); } catch (_) {}
    const sel = String(selector || "").trim();
    if (!sel) return { ok: false, error: "Selector required" };
    const expr = `(() => {
      try {
        const matches = window.__qsDeepAll(${JSON.stringify(sel)});
        if (matches.length > 0) window.__harnessHighlight(matches[0]);
        return { count: matches.length };
      } catch (err) { return { count: 0, error: String(err && err.message || err) }; }
    })()`;
    try {
      const res = await dbg.sendCommand("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
        awaitPromise: false
      });
      if (res?.exceptionDetails) {
        return { ok: false, error: res.exceptionDetails.exception?.description || "Selector failed" };
      }
      const value = res?.result?.value || { count: 0 };
      if (value.error) return { ok: false, error: value.error };
      return { ok: true, count: value.count || 0 };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle("capture:save", (_e, payload) => {
    if (!state.recorder || !state.session) return { ok: false, error: "No active session" };
    const { screenshot, rect, text, url } = payload || {};
    if (!screenshot || !rect) return { ok: false, error: "Missing screenshot or rect" };
    state.recorder.addCapture({ screenshot, rect, text, url: url || state.session.url });
    return { ok: true };
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
  ipcMain.handle("session:set-name", (_e, name) => {
    if (!state.session) return { ok: false, error: "No active session" };
    const trimmed = String(name || "").trim().slice(0, 120);
    state.session.name = trimmed || null;
    if (state.session.historyId) {
      updateSession(state.session.historyId, { name: state.session.name });
    }
    return { ok: true, name: state.session.name };
  });
  ipcMain.handle("sessions:rename", (_e, { id, name }) => {
    const trimmed = String(name || "").trim().slice(0, 120);
    const updated = updateSession(id, { name: trimmed || null });
    if (!updated) return { ok: false, error: "Session not found" };
    return { ok: true, session: updated };
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
      title: title || state.session?.name || state.session?.url || "User journey",
      callouts: callouts !== false
    };
    const stamp = new Date(meta.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fmt = format === "pdf" ? "pdf" : format === "md" ? "md" : "html";
    const filter = fmt === "pdf"
      ? { name: "PDF", extensions: ["pdf"] }
      : fmt === "md"
        ? { name: "Markdown", extensions: ["md", "markdown"] }
        : { name: "HTML", extensions: ["html", "htm"] };
    const saveResult = await dialog.showSaveDialog(state.mainWindow, {
      title: fmt === "pdf" ? "Export walkthrough PDF" : fmt === "md" ? "Export walkthrough Markdown" : "Export user journey",
      defaultPath: `journey-${stamp}.${fmt}`,
      filters: [filter]
    });
    if (saveResult.canceled || !saveResult.filePath) return { ok: false };
    if (fmt === "md") {
      const md = renderJourneyMarkdown(steps, meta);
      fs.writeFileSync(saveResult.filePath, md, "utf8");
      return { ok: true, path: saveResult.filePath };
    }
    const html = renderJourneyHtml(steps, meta);
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

function renderJourneyMarkdown(selection, meta) {
  const when = new Date(meta.startedAt).toLocaleString();
  const title = meta.title || "User journey";
  const framework = (meta.framework || "").toUpperCase() || "—";
  const lines = [
    `# ${title}`,
    "",
    `_Recorded ${when} · Framework ${framework} · ${selection.length} step${selection.length === 1 ? "" : "s"}_`,
    ""
  ];
  for (const { step } of selection) {
    const num = String(lines.filter((l) => /^## \d/.test(l)).length + 1).padStart(2, "0");
    if (step.kind === "note") {
      lines.push(`## ${num}. Note`, "");
      lines.push(...String(step.text || "").split("\n").map((l) => `> ${l}`));
      lines.push("");
      if (step.screenshot) {
        lines.push(`![Context screenshot](${step.screenshot})`, "");
      }
      lines.push("---", "");
      continue;
    }
    if (step.kind === "capture") {
      lines.push(`## ${num}. Capture`, "");
      if (step.text) lines.push(String(step.text), "");
      if (step.screenshot) {
        lines.push(`![Annotated capture](${step.screenshot})`, "");
        if (step.rect) {
          const { x, y, width, height } = step.rect;
          lines.push(`_Highlighted region: ${x.toFixed(1)}%, ${y.toFixed(1)}% — ${width.toFixed(1)}% × ${height.toFixed(1)}%_`, "");
        }
      }
      lines.push("---", "");
      continue;
    }
    if (step.kind === "wait") {
      lines.push(`## ${num}. Wait ${Number(step.ms) || 0}ms`, "", "---", "");
      continue;
    }
    if (step.kind === "assert") {
      const loc = step.locator || {};
      const sel = loc.css || loc.xpath || "";
      const t = step.assertionType || "visible";
      const phrase = {
        visible: "is visible",
        hidden: "is hidden",
        text: `has text \`${step.expected ?? ""}\``,
        contains: `contains \`${step.expected ?? ""}\``,
        value: `has value \`${step.expected ?? ""}\``
      }[t] || t;
      lines.push(`## ${num}. Expect`, "", `**Selector:** \`${sel}\``, "", `**Assertion:** ${phrase}`, "", "---", "");
      continue;
    }
    if (step.kind === "navigate") {
      lines.push(`## ${num}. Navigate`, "", `→ ${step.url || ""}`, "");
      if (step.screenshot) lines.push(`![Page screenshot](${step.screenshot})`, "");
      lines.push("---", "");
      continue;
    }
    // interactive steps: click, fill, select, check, press, submit
    const d = describeStep(step);
    const loc = step.locator || {};
    const chain = Array.isArray(loc.shadowChain) && loc.shadowChain.length
      ? loc.shadowChain.join(" » ") + " » "
      : "";
    const sel = loc.css || loc.xpath || "";
    lines.push(`## ${num}. ${d.action}`, "");
    lines.push(`**Target:** ${d.target}`, "");
    if (sel) lines.push(`**Selector:** \`${chain}${sel}\``, "");
    if (d.value !== undefined) lines.push(`**Value:** \`${JSON.stringify(d.value)}\``, "");
    if (step.screenshot) lines.push(`![Screenshot](${step.screenshot})`, "");
    lines.push("---", "");
  }
  return lines.join("\n");
}

async function renderHtmlToPdf(html) {
  const tmp = path.join(os.tmpdir(), `harness-walkthrough-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
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
  if (step.kind === "wait") return { action: "Wait", target: `${Number(step.ms) || 0}ms` };
  if (step.kind === "capture") return { action: "Capture", target: step.text || "(annotated region)" };
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
    if (step.kind === "capture") {
      const textHtml = escapeHtml(step.text || "").replace(/\n/g, "<br />");
      let shot = "";
      if (step.screenshot) {
        let overlay = "";
        if (step.rect) {
          const { x, y, width, height } = step.rect;
          overlay = `<div class="bbox" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%;"></div>`;
        }
        shot = `<figure class="shot"><img src="${step.screenshot}" alt="Captured region" />${overlay}</figure>`;
      }
      return `
      <section class="step step--capture">
        <div class="num">${num}</div>
        <div class="body">
          <div class="headline">📷 Annotated capture</div>
          ${textHtml ? `<div class="note-text">${textHtml}</div>` : ""}
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
    .step--capture {
      background: var(--blue-light);
      border-color: var(--blue);
    }
    .step--capture .headline { color: var(--blue-dark); }
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
    app.setName("Harness");
    if (process.platform === "linux") app.setAppUserModelId("com.harness.app");
  } catch (_) {}
  migrateLegacyUserData();
  registerIpc();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

let _quitting = false;

async function gracefulShutdown() {
  if (_quitting) return;
  _quitting = true;
  if (state.replayAbort) {
    try { state.replayAbort.abort(); } catch (_) {}
    state.replayAbort = null;
  }
  state.replayRunning = false;
  if (state.recorder) {
    try { state.recorder.removeAllListeners(); } catch (_) {}
    try { await state.recorder.stop(); } catch (_) {}
    state.recorder = null;
  }
  if (state.browserView) {
    try {
      const wc = state.browserView.webContents;
      if (wc && !wc.isDestroyed() && wc.debugger && wc.debugger.isAttached()) {
        try { wc.debugger.detach(); } catch (_) {}
      }
    } catch (_) {}
    try { destroyBrowserView(); } catch (_) {}
  }
  state.session = null;
}

app.on("before-quit", async (e) => {
  if (_quitting) return;
  e.preventDefault();
  await gracefulShutdown();
  app.exit(0);
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
