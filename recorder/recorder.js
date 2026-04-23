"use strict";

const { EventEmitter } = require("node:events");
const { createRecorderScript } = require("./recorder-script.js");
const { normalizeTrace, generateCode } = require("./codegen.js");
const { buildLocatorSnapshot } = require("./locator.js");

const BINDING = "__scriptGenRecord";

function now() {
  return Date.now();
}

class DebuggerRecorder extends EventEmitter {
  constructor(webContents, options = {}) {
    super();
    this.webContents = webContents;
    this.options = {
      captureSensitive: Boolean(options.captureSensitive),
      debounceMs: Number(options.debounceMs ?? 350),
      target: options.target ?? "playwright",
      namespace: options.namespace ?? "ui",
      customMapping: options.customMapping || null
    };
    this.traces = new Map();
    this.sessions = new Map();
    this.pollTimers = new Map();
    this.started = false;
    this.paused = false;
    this.startedAt = now();
    this._onMessage = this._onMessage.bind(this);
    this._onDetach = this._onDetach.bind(this);
    this._counter = 0;
  }

  pause() {
    this.paused = true;
    for (const timer of this.pollTimers.values()) clearInterval(timer);
    this.pollTimers.clear();
  }

  resume() {
    this.paused = false;
  }

  loadSteps(steps, info = {}) {
    const targetId = info.targetId || "loaded";
    const trace = { targetId, url: info.url || "", title: info.title || "", events: [] };
    for (const event of steps || []) {
      trace.events.push({ ...event, targetId });
      this._counter += 1;
    }
    this.traces.set(targetId, trace);
  }

  attachLatestNavigateScreenshot(dataUrl) {
    const traces = [...this.traces.values()];
    for (let t = traces.length - 1; t >= 0; t -= 1) {
      const events = traces[t].events;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        if (events[i].kind === "navigate" && !events[i].screenshot) {
          events[i].screenshot = dataUrl;
          return events[i];
        }
      }
    }
    return null;
  }

  attachLatestStepScreenshot(dataUrl) {
    const traces = [...this.traces.values()];
    for (let t = traces.length - 1; t >= 0; t -= 1) {
      const events = traces[t].events;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const ev = events[i];
        if (ev.kind !== "navigate" && !ev.screenshot) {
          ev.screenshot = dataUrl;
          return ev;
        }
      }
    }
    return null;
  }

  addNote(text, info = {}) {
    const url = info.url || "";
    const targetId = info.targetId || (this.traces.size > 0 ? [...this.traces.keys()].pop() : "root");
    const trace = this._ensureTrace(targetId, { url, title: info.title || "" });
    const event = {
      kind: "note",
      ts: now(),
      targetId,
      text: String(text || "").trim(),
      url
    };
    trace.events.push(event);
    this._emitStep(event);
    return event;
  }

  get stepCount() {
    let total = 0;
    for (const trace of this.traces.values()) total += trace.events.length;
    return total;
  }

  get shadowCount() {
    let total = 0;
    for (const trace of this.traces.values()) {
      for (const event of trace.events) {
        if (Array.isArray(event.locator?.shadowChain) && event.locator.shadowChain.length > 0) total += 1;
      }
    }
    return total;
  }

  get warningCount() {
    let total = 0;
    for (const trace of this.traces.values()) {
      for (const event of trace.events) {
        if (event.locator?.ambiguous || (event.locator?.matchedCount && event.locator.matchedCount > 1)) total += 1;
      }
    }
    return total;
  }

  async start() {
    if (this.started) return;
    const dbg = this.webContents.debugger;
    if (!dbg.isAttached()) dbg.attach("1.3");
    dbg.on("message", this._onMessage);
    dbg.on("detach", this._onDetach);

    await dbg.sendCommand("Page.enable");
    await dbg.sendCommand("DOM.enable");
    await dbg.sendCommand("Runtime.enable");
    await dbg.sendCommand("Network.enable");
    await dbg.sendCommand("Input.setIgnoreInputEvents", { ignore: false });

    await dbg.sendCommand("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });

    await this._installForSession(undefined, { targetId: "root", url: this.webContents.getURL(), title: this.webContents.getTitle() });
    this.started = true;
  }

  async stop() {
    this.pause();
    const dbg = this.webContents.debugger;
    try {
      dbg.off("message", this._onMessage);
      dbg.off("detach", this._onDetach);
    } catch (_) {}
    try {
      if (dbg.isAttached()) dbg.detach();
    } catch (_) {}
    this.started = false;
  }

  clear() {
    this.traces.clear();
    this._counter = 0;
    this.emit("cleared");
  }

  getTraces() {
    return normalizeTrace({ traces: [...this.traces.values()] });
  }

  getSteps() {
    const out = [];
    for (const trace of this.traces.values()) {
      for (const event of trace.events) out.push(event);
    }
    return out;
  }

  generate(options = {}) {
    return generateCode(this.getTraces(), {
      target: options.target || this.options.target,
      namespace: options.namespace || this.options.namespace,
      mapping: options.mapping || this.options.customMapping
    });
  }

  _onDetach(_event, reason) {
    this.emit("detached", reason);
    this.started = false;
  }

  async _onMessage(_event, method, params, sessionId) {
    try {
      if (method === "Target.attachedToTarget") {
        const info = params.targetInfo || {};
        if (info.type === "page" || info.type === "iframe") {
          await this._installForSession(params.sessionId, info);
        }
        return;
      }
      if (method === "Target.detachedFromTarget") {
        this.sessions.delete(params.sessionId);
        const timer = this.pollTimers.get(params.sessionId || "root");
        if (timer) {
          clearInterval(timer);
          this.pollTimers.delete(params.sessionId || "root");
        }
        return;
      }
      const session = this.sessions.get(sessionId || "root");
      if (!session) return;
      if (method === "Runtime.bindingCalled" && params.name === BINDING) {
        if (this.paused) return;
        this._handleRecorderPayload(session.info, params.payload);
        return;
      }
      if (method === "Runtime.executionContextCreated") {
        const ctx = params.context || {};
        const aux = ctx.auxData || {};
        if (!aux.frameId || aux.isDefault === false) return;
        await this._injectIntoContext(sessionId, ctx.id);
        return;
      }
      if (method === "Runtime.executionContextDestroyed") {
        session.contexts.delete(params.executionContextId);
        return;
      }
      if (method === "Page.frameNavigated") {
        const frame = params.frame || {};
        if (!frame.parentId && frame.url && frame.url !== "about:blank") {
          this._handleNavigation(session.info, frame.url, frame.name || session.info.title || "");
        }
      }
    } catch (err) {
      if (this.listenerCount("error") > 0) this.emit("error", err);
    }
  }

  async _installForSession(sessionId, info) {
    const key = sessionId || "root";
    if (this.sessions.has(key)) return;
    this.sessions.set(key, { id: sessionId, info: { ...info, targetId: info.targetId || key }, contexts: new Set() });
    const dbg = this.webContents.debugger;
    const script = createRecorderScript({
      bindingName: BINDING,
      captureSensitive: this.options.captureSensitive,
      debounceMs: this.options.debounceMs
    });
    try {
      if (sessionId) {
        await dbg.sendCommand("Runtime.enable", {}, sessionId);
        await dbg.sendCommand("Page.enable", {}, sessionId);
        await dbg.sendCommand("DOM.enable", {}, sessionId);
      }
      await dbg.sendCommand("Runtime.addBinding", { name: BINDING }, sessionId);
      await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: script }, sessionId);
      await dbg.sendCommand("Runtime.evaluate", { expression: script, awaitPromise: false, includeCommandLineAPI: true }, sessionId);
      if (sessionId) {
        await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      if (!msg.includes("Cannot find context")) {
        if (this.listenerCount("error") > 0) this.emit("error", err);
      }
    }

    const poll = setInterval(() => {
      this._drainContextQueues(sessionId).catch((err) => {
        if (this.listenerCount("error") > 0) this.emit("error", err);
      });
    }, this.options.debounceMs);
    this.pollTimers.set(key, poll);

    if (info.url && info.url !== "about:blank") {
      this._handleNavigation({ ...info, targetId: info.targetId || key }, info.url, info.title || "");
    }
  }

  async _injectIntoContext(sessionId, contextId) {
    const key = sessionId || "root";
    const session = this.sessions.get(key);
    if (!session) return;
    if (session.contexts.has(contextId)) return;
    const dbg = this.webContents.debugger;
    const script = createRecorderScript({
      bindingName: BINDING,
      captureSensitive: this.options.captureSensitive,
      debounceMs: this.options.debounceMs
    });
    try {
      await dbg.sendCommand("Runtime.evaluate", {
        expression: script,
        contextId,
        awaitPromise: false,
        includeCommandLineAPI: true
      }, sessionId);
      session.contexts.add(contextId);
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes("Cannot find context")) return;
    }
  }

  async _drainContextQueues(sessionId) {
    const key = sessionId || "root";
    const session = this.sessions.get(key);
    if (!session) return;
    const dbg = this.webContents.debugger;
    const expression = `(() => {
      const queue = globalThis.__scriptGenRecorderQueue || [];
      const items = queue.splice(0, queue.length);
      return items;
    })()`;
    for (const contextId of session.contexts) {
      try {
        const res = await dbg.sendCommand("Runtime.evaluate", {
          expression,
          contextId,
          returnByValue: true,
          awaitPromise: false
        }, sessionId);
        const events = res?.result?.value;
        if (Array.isArray(events) && events.length) {
          for (const event of events) this._handleRecorderPayload(session.info, JSON.stringify(event));
        }
      } catch (_) {}
    }
  }

  _ensureTrace(targetId, info = {}) {
    if (this.traces.has(targetId)) {
      const existing = this.traces.get(targetId);
      existing.url = info.url || existing.url || "";
      existing.title = info.title || existing.title || "";
      return existing;
    }
    const trace = { targetId, url: info.url || "", title: info.title || "", events: [] };
    this.traces.set(targetId, trace);
    return trace;
  }

  _handleNavigation(info, url, title) {
    if (this.paused) return;
    if (!info?.targetId || !url || url === "about:blank") return;
    const trace = this._ensureTrace(info.targetId, info);
    const last = trace.events[trace.events.length - 1];
    if (last?.kind === "navigate" && last.url === url) return;
    const event = {
      kind: "navigate",
      url,
      title,
      ts: now(),
      targetId: info.targetId
    };
    trace.events.push(event);
    this._emitStep(event);
  }

  _handleRecorderPayload(info, payload) {
    if (!info?.targetId) return;
    let raw;
    try { raw = JSON.parse(payload); } catch { return; }
    if (!raw?.kind) return;
    const trace = this._ensureTrace(info.targetId, info);
    const locator = raw.kind === "navigate" ? null : buildLocatorSnapshot(raw.element || {});
    const normalized = {
      ...raw,
      locator,
      targetId: info.targetId,
      ts: Number(raw.ts || now())
    };
    if (normalized.kind === "navigate" && normalized.url === "about:blank") return;
    const last = trace.events[trace.events.length - 1];
    if (
      normalized.kind === "fill" &&
      last?.kind === "fill" &&
      last.locator?.css === locator?.css
    ) {
      trace.events[trace.events.length - 1] = normalized;
    } else {
      trace.events.push(normalized);
    }
    this._emitStep(normalized);
  }

  _emitStep(event) {
    this._counter += 1;
    this.emit("step", { ...event, number: this._counter });
  }
}

function renderLiveStep(event) {
  if (!event) return "";
  if (event.kind === "navigate") return `navigate ${event.url}`;
  const loc = event.locator || {};
  const label = loc.label || loc.name || loc.text || loc.css || loc.xpath || event.element?.tag || event.kind;
  if (event.kind === "fill") return `fill ${label} = ${JSON.stringify(event.value ?? "")}`;
  if (event.kind === "check") return `${event.checked ? "check" : "uncheck"} ${label}`;
  if (event.kind === "select") return `select ${label} = ${JSON.stringify(event.value ?? "")}`;
  if (event.kind === "press") return `press ${label} ${event.key || "Enter"}`;
  if (event.kind === "submit") return `submit ${label}`;
  return `${event.kind} ${label}`;
}

module.exports = { DebuggerRecorder, renderLiveStep };
