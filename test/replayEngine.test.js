"use strict";

// Coverage for the replay engine. We can't actually replay against a
// browser from node:test, but we can:
//   - assert that the QS_DEEP source string defines the helpers we depend on
//   - assert replaySteps' control flow against a mocked CDP debugger that
//     records the commands it received

const test = require("node:test");
const assert = require("node:assert/strict");
const { replaySteps, QS_DEEP } = require("../recorder/replayEngine.js");

test("QS_DEEP source defines __qsDeep, __qsDeepAll and __harnessHighlight", () => {
  assert.match(QS_DEEP, /window\.__qsDeep\b/);
  assert.match(QS_DEEP, /window\.__qsDeepAll\b/);
  assert.match(QS_DEEP, /window\.__harnessHighlight\b/);
});

test("QS_DEEP pierce-syntax parser splits on >> with trim", () => {
  // The string ` >> ` is the documented separator; QS_DEEP must do the split.
  assert.match(QS_DEEP, /split\(" >> "\)/);
});

function makeMockDebugger() {
  const calls = [];
  const listeners = [];
  return {
    calls,
    on(event, handler) { if (event === "message") listeners.push(handler); },
    off(event, handler) {
      if (event !== "message") return;
      const i = listeners.indexOf(handler);
      if (i !== -1) listeners.splice(i, 1);
    },
    async sendCommand(method, params) {
      calls.push({ method, params });
      if (method === "Page.navigate") {
        // Fire the load events the engine is waiting on.
        setImmediate(() => {
          for (const l of [...listeners]) {
            try { l({}, "Page.loadEventFired", {}); } catch (_) {}
          }
        });
        return {};
      }
      if (method !== "Runtime.evaluate") return {};
      const expr = params?.expression || "";
      if (/document\.readyState/.test(expr)) return { result: { value: "complete" } };
      if (/location\.href/.test(expr)) return { result: { value: "about:blank" } };
      // Selector-existence probe: `!!window.__qsDeep(...)` returns plain bool
      if (/^\s*!!/.test(expr) && /__qsDeep/.test(expr)) {
        return { result: { value: true } };
      }
      // Standalone highlight() helper returns plain `true`
      if (/__harnessHighlight\(el\);[\s\S]*return true;[\s\S]*\}\)\(\)/.test(expr) && !/return \{/.test(expr)) {
        return { result: { value: true } };
      }
      // clickElement asks for getBoundingClientRect coords
      if (/getBoundingClientRect/.test(expr)) {
        return { result: { value: { ok: true, coords: null } } };
      }
      // fill / select / check / press / generic helpers return { ok: true }
      return { result: { value: { ok: true } } };
    }
  };
}

test("replaySteps returns one ReplayResult per step with status pass and a numeric duration", async () => {
  const dbg = makeMockDebugger();
  const steps = [
    { kind: "navigate", url: "https://example.com" },
    { kind: "click", locator: { css: "#btn" } }
  ];
  const results = await replaySteps(steps, dbg);
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.equal(r.status, "pass");
    assert.equal(typeof r.durationMs, "number");
    assert.equal(r.error, null);
  }
});

test("replaySteps skips redundant navigate when the next step is also a navigate", async () => {
  const dbg = makeMockDebugger();
  const steps = [
    // Tracker / OAuth bounce — should be skipped
    { kind: "navigate", url: "https://tracker.example/redirect/abc123" },
    // Real destination — should actually fire
    { kind: "navigate", url: "https://app.example/dashboard" }
  ];
  await replaySteps(steps, dbg);
  // Only the second navigate should have been issued
  const navigateCalls = dbg.calls.filter((c) => c.method === "Page.navigate");
  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0].params.url, "https://app.example/dashboard");
});

test("replaySteps invokes onStep callback for each result", async () => {
  const dbg = makeMockDebugger();
  const observed = [];
  await replaySteps(
    [{ kind: "click", locator: { css: "#a" } }, { kind: "click", locator: { css: "#b" } }],
    dbg,
    { onStep: (r) => observed.push(r) }
  );
  assert.equal(observed.length, 2);
  assert.equal(observed[0].stepIndex, 0);
  assert.equal(observed[1].stepIndex, 1);
});

test("replaySteps respects an aborted AbortSignal mid-loop", async () => {
  const dbg = makeMockDebugger();
  const controller = new AbortController();
  const steps = [
    { kind: "click", locator: { css: "#a" } },
    { kind: "click", locator: { css: "#b" } },
    { kind: "click", locator: { css: "#c" } }
  ];
  // Abort before the second iteration starts
  const original = dbg.sendCommand.bind(dbg);
  let calls = 0;
  dbg.sendCommand = async (...args) => {
    calls += 1;
    if (calls === 2) controller.abort();
    return original(...args);
  };
  const results = await replaySteps(steps, dbg, { signal: controller.signal });
  assert.ok(results.length < steps.length, `expected fewer than ${steps.length} results, got ${results.length}`);
});
