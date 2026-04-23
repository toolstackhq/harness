"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLocatorSnapshot } = require("../recorder/locator.js");

test("prefers stable attributes", () => {
  const locator = buildLocatorSnapshot({
    tag: "button",
    id: "login",
    text: "Login",
    role: "button"
  });

  assert.equal(locator.css, "#login");
  assert.equal(locator.playwright.kind, "role");
});

test("uses placeholder for text fields", () => {
  const locator = buildLocatorSnapshot({
    tag: "input",
    type: "text",
    placeholder: "Email address"
  });

  assert.equal(locator.playwright.kind, "placeholder");
  assert.equal(locator.cypress.kind, "css");
});

test("flags ambiguous locators", () => {
  const locator = buildLocatorSnapshot({
    tag: "div",
    index: 1
  });

  assert.equal(locator.ambiguous, true);
});

test("passes shadow chain through", () => {
  const locator = buildLocatorSnapshot({
    tag: "button",
    id: "x",
    shadowChain: ["host-a", "host-b"]
  });

  assert.equal(locator.inShadow, true);
  assert.deepEqual(locator.shadowChain, ["host-a", "host-b"]);
});
