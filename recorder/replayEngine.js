"use strict";

const QS_DEEP = `
(() => {
  if (window.__harnessHighlight) return;
  window.__harnessHighlight = function(el) {
    try {
      if (!el || !el.getBoundingClientRect) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      const box = document.createElement("div");
      box.style.cssText = [
        "position:fixed",
        "left:" + (rect.left - 2) + "px",
        "top:" + (rect.top - 2) + "px",
        "width:" + (rect.width + 4) + "px",
        "height:" + (rect.height + 4) + "px",
        "border:2px dashed #1a73e8",
        "border-radius:4px",
        "background:rgba(26,115,232,0.08)",
        "box-shadow:0 0 0 2px rgba(26,115,232,0.15)",
        "pointer-events:none",
        "z-index:2147483647",
        "transition:opacity 0.4s ease-out",
        "opacity:1"
      ].join(";");
      box.setAttribute("data-harness-highlight", "1");
      (document.body || document.documentElement).appendChild(box);
      setTimeout(() => { box.style.opacity = "0"; }, 450);
      setTimeout(() => { try { box.remove(); } catch (_) {} }, 900);
    } catch (_) {}
  };
  if (window.__qsDeep) return;
  window.__qsDeep = function(selector) {
    if (!selector) return null;
    const parts = String(selector).split(" >> ").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      let ctx = document;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const host = ctx.querySelector(parts[i]);
        if (!host || !host.shadowRoot) return null;
        ctx = host.shadowRoot;
      }
      return ctx.querySelector(parts[parts.length - 1]);
    }
    try {
      const direct = document.querySelector(selector);
      if (direct) return direct;
    } catch (_) {}
    const queue = [document];
    const seen = new Set();
    while (queue.length) {
      const root = queue.shift();
      if (seen.has(root)) continue;
      seen.add(root);
      try {
        const found = root.querySelector(selector);
        if (found) return found;
      } catch (_) {}
      const all = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const el of all) if (el.shadowRoot) queue.push(el.shadowRoot);
    }
    return null;
  };
})();
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectQsDeep(dbg) {
  try {
    await dbg.sendCommand("Runtime.evaluate", { expression: QS_DEEP, awaitPromise: false });
  } catch (_) {}
}

function buildSelector(step) {
  const loc = step.locator || {};
  const chain = Array.isArray(loc.shadowChain) ? loc.shadowChain : [];
  const leaf = loc.css || loc.xpath || "";
  if (!leaf) return "";
  if (chain.length === 0) return leaf;
  return [...chain, leaf].join(" >> ");
}

async function evalInPage(dbg, expression, returnByValue = true) {
  const res = await dbg.sendCommand("Runtime.evaluate", {
    expression,
    returnByValue,
    awaitPromise: false,
    includeCommandLineAPI: true
  });
  if (res?.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Evaluation failed");
  }
  return res?.result?.value;
}

async function highlight(dbg, selector) {
  const js = `(() => {
    const el = window.__qsDeep(${JSON.stringify(selector)});
    if (!el) return false;
    window.__harnessHighlight(el);
    return true;
  })()`;
  const ok = await evalInPage(dbg, js);
  return ok === true;
}

const HIGHLIGHT_PAUSE_MS = 250;

async function resolveWithRetry(dbg, selector, timeoutMs = 8000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const found = await evalInPage(dbg, `!!window.__qsDeep(${JSON.stringify(selector)})`);
      if (found === true) return true;
    } catch (err) {
      lastErr = err;
    }
    await sleep(250);
  }
  return false;
}

async function clickElement(dbg, selector) {
  if (!(await resolveWithRetry(dbg, selector))) throw new Error(`Click target not found after retries: ${selector}`);
  if (!(await highlight(dbg, selector))) throw new Error(`Click target not found: ${selector}`);
  await sleep(HIGHLIGHT_PAUSE_MS);
  const js = `(() => {
    const el = window.__qsDeep(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      el.click();
      return { ok: true, coords: null };
    }
    return { ok: true, coords: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } };
  })()`;
  const result = await evalInPage(dbg, js);
  if (!result || !result.ok) throw new Error(`Click target not found: ${selector}`);
  if (result.coords) {
    const { x, y } = result.coords;
    await dbg.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await dbg.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await dbg.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
}

async function fillElement(dbg, selector, value) {
  if (!(await resolveWithRetry(dbg, selector))) throw new Error(`Fill target not found after retries: ${selector}`);
  if (!(await highlight(dbg, selector))) throw new Error(`Fill target not found: ${selector}`);
  await sleep(HIGHLIGHT_PAUSE_MS);
  const js = `(() => {
    const el = window.__qsDeep(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    el.focus();
    if ("value" in el) {
      const setter = Object.getOwnPropertyDescriptor(el.__proto__ || {}, "value")?.set;
      if (setter) setter.call(el, ${JSON.stringify(value)});
      else el.value = ${JSON.stringify(value)};
    } else if (el.isContentEditable) {
      el.textContent = ${JSON.stringify(value)};
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  })()`;
  const result = await evalInPage(dbg, js);
  if (!result || !result.ok) throw new Error(`Fill target not found: ${selector}`);
}

async function selectOption(dbg, selector, value) {
  if (!(await resolveWithRetry(dbg, selector))) throw new Error(`Select target not found after retries: ${selector}`);
  if (!(await highlight(dbg, selector))) throw new Error(`Select target not found: ${selector}`);
  await sleep(HIGHLIGHT_PAUSE_MS);
  const js = `(() => {
    const el = window.__qsDeep(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  })()`;
  const result = await evalInPage(dbg, js);
  if (!result || !result.ok) throw new Error(`Select target not found: ${selector}`);
}

async function checkElement(dbg, selector, checked) {
  if (!(await resolveWithRetry(dbg, selector))) throw new Error(`Check target not found after retries: ${selector}`);
  if (!(await highlight(dbg, selector))) throw new Error(`Check target not found: ${selector}`);
  await sleep(HIGHLIGHT_PAUSE_MS);
  const js = `(() => {
    const el = window.__qsDeep(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    el.checked = ${checked ? "true" : "false"};
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  })()`;
  const result = await evalInPage(dbg, js);
  if (!result || !result.ok) throw new Error(`Check target not found: ${selector}`);
}

async function pressKey(dbg, selector, key) {
  if (!(await resolveWithRetry(dbg, selector))) throw new Error(`Press target not found after retries: ${selector}`);
  if (!(await highlight(dbg, selector))) throw new Error(`Press target not found: ${selector}`);
  await sleep(HIGHLIGHT_PAUSE_MS);
  const focus = `(() => {
    const el = window.__qsDeep(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    return true;
  })()`;
  const ok = await evalInPage(dbg, focus);
  if (!ok) throw new Error(`Press target not found: ${selector}`);
  const keyMap = { Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 } };
  const k = keyMap[key] || { key, code: key };
  await dbg.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", ...k });
  await dbg.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", ...k });
}

function waitForNetworkAndLoad(dbg, { timeout = 25000, idleMs = 600, maxInflight = 0 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let loadFired = false;
    let inflight = 0;
    let lastActivity = Date.now();
    const finish = (reason) => {
      if (done) return;
      done = true;
      clearInterval(poller);
      try { dbg.off("message", listener); } catch (_) {}
      resolve(reason);
    };
    const listener = (_event, method) => {
      if (method === "Page.loadEventFired" || method === "Page.frameStoppedLoading") {
        loadFired = true;
        lastActivity = Date.now();
      } else if (method === "Network.requestWillBeSent") {
        inflight += 1;
        lastActivity = Date.now();
      } else if (
        method === "Network.loadingFinished" ||
        method === "Network.loadingFailed" ||
        method === "Network.responseReceived"
      ) {
        inflight = Math.max(0, inflight - 1);
        lastActivity = Date.now();
      }
    };
    try { dbg.on("message", listener); } catch (_) {}
    const poller = setInterval(() => {
      if (loadFired && inflight <= maxInflight && Date.now() - lastActivity >= idleMs) {
        finish("idle");
      }
    }, 150);
    setTimeout(() => finish("timeout"), timeout);
  });
}

async function waitForReady(dbg, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const state = await evalInPage(dbg, "document.readyState");
      if (state === "complete") return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function replaySteps(steps, dbg, options = {}) {
  const { onStep, signal } = options;
  const results = [];
  await injectQsDeep(dbg);

  for (let i = 0; i < steps.length; i += 1) {
    if (signal?.aborted) break;
    const step = steps[i];
    const start = Date.now();
    let status = "pass";
    let error = null;
    try {
      if (step.kind === "navigate") {
        let currentUrl = "";
        try { currentUrl = await evalInPage(dbg, "location.href"); } catch (_) {}
        if (currentUrl && currentUrl === step.url) {
          // Already on the target page (e.g. the initial navigate duplicates
          // the session.url we already loaded). Just ensure the document is
          // ready and skip the re-navigate.
          await waitForReady(dbg);
          await injectQsDeep(dbg);
        } else {
          const loadP = waitForNetworkAndLoad(dbg);
          await dbg.sendCommand("Page.navigate", { url: step.url });
          await loadP;
          await waitForReady(dbg);
          await injectQsDeep(dbg);
        }
      } else if (step.kind === "click" || step.kind === "submit") {
        const sel = buildSelector(step);
        if (!sel) throw new Error("No selector");
        await clickElement(dbg, sel);
        await sleep(300);
      } else if (step.kind === "fill") {
        const sel = buildSelector(step);
        if (!sel) throw new Error("No selector");
        await fillElement(dbg, sel, step.value ?? "");
      } else if (step.kind === "select") {
        const sel = buildSelector(step);
        if (!sel) throw new Error("No selector");
        await selectOption(dbg, sel, step.value ?? "");
      } else if (step.kind === "check") {
        const sel = buildSelector(step);
        if (!sel) throw new Error("No selector");
        await checkElement(dbg, sel, Boolean(step.checked));
      } else if (step.kind === "press") {
        const sel = buildSelector(step);
        if (!sel) throw new Error("No selector");
        await pressKey(dbg, sel, step.key || "Enter");
      } else if (step.kind === "wait") {
        await sleep(Math.max(0, Number(step.ms) || 0));
      }
    } catch (err) {
      status = "fail";
      error = String(err?.message || err);
    }
    const durationMs = Date.now() - start;
    const entry = { stepIndex: i, status, error, durationMs };
    results.push(entry);
    try { onStep?.(entry); } catch (_) {}
    await sleep(500);
  }
  return results;
}

module.exports = { replaySteps, QS_DEEP };
