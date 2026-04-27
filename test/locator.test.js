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

test("data-testid wins over id", () => {
  const loc = buildLocatorSnapshot({
    tag: "button",
    id: "fallback-id",
    dataTestId: "primary"
  });
  assert.equal(loc.css, '[data-testid="primary"]');
  assert.equal(loc.reason, "data-testid");
  assert.equal(loc.quality, "high");
});

test("data-cy and data-pw also map to a high-quality locator", () => {
  const cy = buildLocatorSnapshot({ tag: "button", "data-cy": "submit" });
  const pw = buildLocatorSnapshot({ tag: "button", "data-pw": "submit" });
  assert.equal(cy.css, '[data-testid="submit"]');
  assert.equal(pw.css, '[data-testid="submit"]');
});

test("name attribute is preferred over aria-label", () => {
  const loc = buildLocatorSnapshot({
    tag: "input",
    name: "email",
    ariaLabel: "Your email"
  });
  assert.equal(loc.css, '[name="email"]');
  assert.equal(loc.reason, "name");
});

test("text-only buttons emit a Playwright role locator", () => {
  const loc = buildLocatorSnapshot({ tag: "button", text: "Sign in" });
  assert.equal(loc.playwright.kind, "role");
  assert.equal(loc.playwright.role, "button");
});

test("nth-of-type fallback flags the locator as ambiguous", () => {
  const loc = buildLocatorSnapshot({ tag: "div", index: 3 });
  assert.equal(loc.ambiguous, true);
  assert.match(loc.css, /div:nth-of-type\(3\)/);
});

test("links with text use a contains() locator in cypress", () => {
  const loc = buildLocatorSnapshot({ tag: "a", text: "Settings", href: "/settings" });
  assert.equal(loc.cypress.kind, "contains");
  assert.equal(loc.cypress.text, "Settings");
});

test("xpath escapes single-quoted strings safely", () => {
  const loc = buildLocatorSnapshot({ tag: "a", text: "It's a link" });
  // Should fall back to xpath form when no other anchor matches and the text
  // contains a single quote. The xpath helper picks double quotes in that case.
  assert.match(loc.xpath, /"It's a link"/);
});
