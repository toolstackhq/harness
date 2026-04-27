"use strict";

// High-level integration tests that exercise the full pipeline at the
// pure-JS layer: synthetic recorded events flow through the recorder and
// codegen, and we assert the final emitted artifact looks right.
//
// Three scenarios:
//   1. Record-then-generate produces a valid Playwright script with
//      navigate, fill (parameterised), click, and assert in order.
//   2. Switching the same trace between frameworks yields the right
//      idiomatic syntax for each.
//   3. A custom-mapping run interpolates user-defined templates and
//      respects every step kind including wait + note.

const test = require("node:test");
const assert = require("node:assert/strict");
const { DebuggerRecorder } = require("../recorder/recorder.js");
const { generateCode } = require("../recorder/codegen.js");

function recorderWithSteps() {
  const fakeDbg = { isAttached: () => false, attach() {}, sendCommand: async () => ({}), on() {}, off() {} };
  const r = new DebuggerRecorder({ debugger: fakeDbg, getURL: () => "", getTitle: () => "" });
  // Simulate a real flow: navigate to login → fill username → fill password →
  // click submit → assert greeting visible
  r._handleNavigation({ targetId: "page1" }, "https://example.com/login", "Login");
  r._handleRecorderPayload(
    { targetId: "page1" },
    JSON.stringify({
      kind: "fill",
      value: "alice",
      element: { tag: "input", id: "user", label: "Username" }
    })
  );
  r._handleRecorderPayload(
    { targetId: "page1" },
    JSON.stringify({
      kind: "fill",
      value: "secret",
      element: { tag: "input", id: "pass", label: "Password", type: "password" }
    })
  );
  r._handleRecorderPayload(
    { targetId: "page1" },
    JSON.stringify({
      kind: "click",
      element: { tag: "button", id: "submit", text: "Sign in", role: "button" }
    })
  );
  r.addAssertion({ selector: "#welcome", assertionType: "contains", expected: "Hello" });
  return r;
}

test("integration: record → playwright codegen produces an executable script", () => {
  const r = recorderWithSteps();
  const code = generateCode(r.getTraces(), { target: "playwright" });

  // Parameterised fills extract values to the top
  assert.match(code, /const USERNAME = "alice";/);
  assert.match(code, /const PASSWORD = "secret";/);

  // Body order — search for the USAGE of the constant (.fill(USERNAME)),
  // not its declaration which sits at the top of the file.
  const navIdx = code.indexOf("page.goto(\"https://example.com/login\")");
  const fillUserIdx = code.indexOf(".fill(USERNAME)");
  const clickIdx = code.indexOf("getByRole(\"button\"");
  const expectIdx = code.indexOf("toContainText");
  assert.ok(navIdx >= 0 && navIdx < fillUserIdx, "navigate must come before fill");
  assert.ok(fillUserIdx < clickIdx, "fills must come before click");
  assert.ok(clickIdx < expectIdx, "click must come before assertion");

  // Assertion uses Playwright's @playwright/test import
  assert.match(code, /import \{ chromium, expect \} from "@playwright\/test"/);
});

test("integration: same trace renders idiomatically for cypress and selenium", () => {
  const r = recorderWithSteps();
  const traces = r.getTraces();
  const cy = generateCode(traces, { target: "cypress" });
  const se = generateCode(traces, { target: "selenium" });

  // Cypress: visit + clear/type + click (cy.contains) + .should()
  assert.match(cy, /cy\.visit/);
  assert.match(cy, /\.clear\(\)\.type\(USERNAME\)/);
  assert.match(cy, /\.should\('contain', "Hello"\)/);

  // Selenium: driver.get + sendKeys + isDisplayed/getText assertion
  assert.match(se, /driver\.get/);
  assert.match(se, /sendKeys\(USERNAME\)/);
  assert.match(se, /getText\(\)\)\.includes\("Hello"\)/);
});

test("integration: custom mapping pipeline honours every step kind", () => {
  const fakeDbg = { isAttached: () => false, attach() {}, sendCommand: async () => ({}), on() {}, off() {} };
  const r = new DebuggerRecorder({ debugger: fakeDbg, getURL: () => "", getTitle: () => "" });
  r._handleNavigation({ targetId: "p" }, "https://x.example", "x");
  r.addNote("Watch out — this CTA is text-matched");
  r._handleRecorderPayload({ targetId: "p" }, JSON.stringify({
    kind: "click",
    element: { tag: "button", id: "next", text: "Next" }
  }));
  r.addWait(500);
  r._handleRecorderPayload({ targetId: "p" }, JSON.stringify({
    kind: "fill",
    value: "abc@x.com",
    element: { tag: "input", id: "email", label: "Email" }
  }));
  r.addAssertion({ selector: "#confirm", assertionType: "visible" });

  const code = generateCode(r.getTraces(), {
    target: "custom",
    mapping: {
      navigate: "this.goTo('{url}')",
      click: "this.clickElement('{selector}')",
      fill: "this.typeInto('{selector}', '{value}')",
      wait: "this.wait({ms})",
      assertVisible: "this.expectVisible('{selector}')"
    }
  });

  assert.match(code, /this\.goTo\('https:\/\/x\.example'\);/);
  assert.match(code, /\/\/ Watch out — this CTA is text-matched/);
  assert.match(code, /this\.clickElement\('#next'\);/);
  assert.match(code, /this\.wait\(500\);/);
  assert.match(code, /this\.typeInto\('#email', 'abc@x\.com'\);/);
  assert.match(code, /this\.expectVisible\('#confirm'\);/);
});
