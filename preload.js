"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const on = (channel, handler) => {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld("harness", {
  settings: {
    get: () => invoke("settings:get"),
    set: (patch) => invoke("settings:set", patch)
  },
  recorder: {
    start: (options) => invoke("recorder:start", options),
    stop: () => invoke("recorder:stop"),
    close: () => invoke("recorder:close"),
    clear: () => invoke("recorder:clear"),
    addNote: (text) => invoke("recorder:add-note", text),
    addWait: (ms) => invoke("recorder:add-wait", ms),
    insertWaitAfter: (number, ms) => invoke("recorder:insert-wait-after", { number, ms }),
    togglePause: () => invoke("recorder:toggle-pause"),
    deleteStep: (number) => invoke("recorder:delete-step", number),
    updateStep: (number, patch) => invoke("recorder:update-step", { number, patch }),
    addAssertion: (payload) => invoke("recorder:add-assertion", payload),
    onStepsChanged: (handler) => on("steps:changed", handler),
    onPaused: (handler) => on("recorder:paused", handler),
    onResumed: (handler) => on("recorder:resumed", handler),
    state: () => invoke("recorder:state"),
    onStep: (handler) => on("step:recorded", handler),
    onCleared: (handler) => on("recorder:cleared", handler),
    onError: (handler) => on("recorder:error", handler),
    onStarted: (handler) => on("recorder:started", handler),
    onStopped: (handler) => on("recorder:stopped", handler),
    onDetached: (handler) => on("recorder:detached", handler),
    onSessionClosed: (handler) => on("session:closed", handler),
    onReplayLoaded: (handler) => on("session:replay-loaded", handler)
  },
  replay: {
    start: () => invoke("replay:start"),
    abort: () => invoke("replay:abort"),
    onStarted: (handler) => on("replay:started", handler),
    onStepPass: (handler) => on("replay:step:pass", handler),
    onStepFail: (handler) => on("replay:step:fail", handler),
    onComplete: (handler) => on("replay:complete", handler)
  },
  browser: {
    setBounds: (bounds) => invoke("browser:set-bounds", bounds),
    setVisible: (visible) => invoke("browser:set-visible", visible),
    navigate: (url) => invoke("browser:navigate", url),
    back: () => invoke("browser:back"),
    forward: () => invoke("browser:forward"),
    reload: () => invoke("browser:reload"),
    onUrlChanged: (handler) => on("browser:url-changed", handler),
    onTitleChanged: (handler) => on("browser:title-changed", handler),
    onLoadFailed: (handler) => on("browser:load-failed", handler)
  },
  script: {
    generate: (options) => invoke("script:generate", options),
    save: (payload) => invoke("script:save", payload),
    copy: (code) => invoke("script:copy", code)
  },
  journey: {
    getSteps: () => invoke("journey:get-steps"),
    export: (payload) => invoke("journey:export", payload),
    onScreenshot: (handler) => on("step:screenshot", handler)
  },
  capture: {
    snapshot: () => invoke("capture:snapshot"),
    save: (payload) => invoke("capture:save", payload)
  },
  inspector: {
    highlight: (selector) => invoke("inspector:highlight", selector),
    onPicked: (handler) => on("inspector:picked", handler)
  },
  sessions: {
    load: () => invoke("sessions:load"),
    delete: (id) => invoke("sessions:delete", id),
    generate: (id) => invoke("sessions:generate", id),
    rename: (id, name) => invoke("sessions:rename", { id, name }),
    saveFile: (payload) => invoke("sessions:save-file", payload),
    replay: (id) => invoke("sessions:replay", id),
    setActiveName: (name) => invoke("session:set-name", name)
  },
  openExternal: (url) => invoke("shell:open-external", url)
});
