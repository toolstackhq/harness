"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DebuggerRecorder } = require("../recorder/recorder.js");

// DebuggerRecorder talks to webContents.debugger only in start()/stop().
// All mutation methods (addNote/addAssertion/etc.) operate on the in-memory
// trace map, so we can exercise them with a stub webContents.
function newRecorder() {
  const fakeDbg = {
    isAttached: () => false,
    attach: () => {},
    sendCommand: async () => ({}),
    on: () => {},
    off: () => {}
  };
  return new DebuggerRecorder({ debugger: fakeDbg, getURL: () => "", getTitle: () => "" });
}

test("addNote pushes a note step with the given text and increments numbering", () => {
  const r = newRecorder();
  r.addNote("first");
  r.addNote("second");
  const steps = r.getSteps();
  assert.equal(steps.length, 2);
  assert.equal(steps[0].kind, "note");
  assert.equal(steps[0].text, "first");
  assert.equal(steps[1].text, "second");
  assert.ok(steps[1].number > steps[0].number);
});

test("addAssertion stores assertion type, expected value and selector locator", () => {
  const r = newRecorder();
  const ev = r.addAssertion({ selector: "#login", assertionType: "text", expected: "Sign in" });
  assert.equal(ev.kind, "assert");
  assert.equal(ev.assertionType, "text");
  assert.equal(ev.expected, "Sign in");
  assert.equal(ev.locator.css, "#login");
  assert.equal(ev.locator.shadowChain.length, 0);
  assert.equal(ev.locator.reason, "assertion");
});

test("addCapture stores screenshot, rect, and text in a capture event", () => {
  const r = newRecorder();
  const ev = r.addCapture({
    screenshot: "data:image/png;base64,abc",
    rect: { x: 10, y: 20, width: 100, height: 30 },
    text: "balance row",
    url: "https://x"
  });
  assert.equal(ev.kind, "capture");
  assert.equal(ev.text, "balance row");
  assert.equal(ev.screenshot, "data:image/png;base64,abc");
  assert.deepEqual(ev.rect, { x: 10, y: 20, width: 100, height: 30 });
});

test("addWait clamps negative or non-numeric ms to zero, valid values pass through", () => {
  const r = newRecorder();
  const a = r.addWait(500);
  const b = r.addWait(-50);
  const c = r.addWait("garbage");
  assert.equal(a.ms, 500);
  assert.equal(b.ms, 0);
  assert.equal(c.ms, 0);
});

test("deleteStepByNumber removes the matching event and leaves the rest intact", () => {
  const r = newRecorder();
  r.addNote("one");
  r.addNote("two");
  r.addNote("three");
  const target = r.getSteps()[1];
  const removed = r.deleteStepByNumber(target.number);
  assert.equal(removed, true);
  const after = r.getSteps();
  assert.equal(after.length, 2);
  assert.deepEqual(after.map((s) => s.text), ["one", "three"]);
});

test("deleteStepByNumber returns false for unknown numbers", () => {
  const r = newRecorder();
  r.addNote("only");
  assert.equal(r.deleteStepByNumber(99999), false);
  assert.equal(r.getSteps().length, 1);
});

test("updateStepByNumber patches value, text, expected, and selector individually", () => {
  const r = newRecorder();
  const a = r.addNote("draft");
  const b = r.addAssertion({ selector: "#x", assertionType: "visible" });

  r.updateStepByNumber(a.number, { text: "final" });
  r.updateStepByNumber(b.number, { selector: "#y", expected: "ok" });

  const after = r.getSteps();
  assert.equal(after.find((s) => s.number === a.number).text, "final");
  const updated = after.find((s) => s.number === b.number);
  assert.equal(updated.locator.css, "#y");
  assert.equal(updated.expected, "ok");
  // Manual selector override clears any shadow chain
  assert.deepEqual(updated.locator.shadowChain, []);
  assert.equal(updated.locator.quality, "manual");
});

test("insertWaitAfterNumber splices a wait into the middle of the trace", () => {
  const r = newRecorder();
  const a = r.addNote("a");
  const b = r.addNote("b");
  const c = r.addNote("c");
  r.insertWaitAfterNumber(b.number, 1500);
  const kinds = r.getSteps().map((s) => s.kind);
  assert.deepEqual(kinds, ["note", "note", "wait", "note"]);
  assert.equal(r.getSteps()[2].ms, 1500);
});

test("loadSteps preserves step.number across history round-trips", () => {
  const r = newRecorder();
  r.loadSteps([
    { kind: "note", text: "loaded one", number: 5 },
    { kind: "note", text: "loaded two", number: 6 }
  ], { url: "https://x", targetId: "loaded" });

  const steps = r.getSteps();
  assert.equal(steps.length, 2);
  assert.equal(steps[0].number, 5);
  assert.equal(steps[1].number, 6);

  // Subsequent additions do not collide with loaded numbers
  const fresh = r.addNote("new");
  assert.ok(fresh.number > 6, "new step number must exceed the highest loaded number");
});

test("pause gates _handleNavigation so navigations recorded while paused are dropped", () => {
  const r = newRecorder();
  // simulate the recorder having prior steps
  r.addNote("before");
  r.pause();
  r._handleNavigation({ targetId: "t" }, "https://example.com", "Example");
  r.resume();
  // Navigation should not have been pushed while paused
  const kinds = r.getSteps().map((s) => s.kind);
  assert.deepEqual(kinds, ["note"]);
});
