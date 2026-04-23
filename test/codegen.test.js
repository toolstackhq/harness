"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateCode, normalizeTrace } = require("../recorder/codegen.js");

test("normalizes a minimal trace", () => {
  const traces = normalizeTrace({
    traces: [
      {
        targetId: "page-1",
        title: "Login",
        events: [
          { kind: "navigate", url: "https://example.com" },
          {
            kind: "fill",
            element: {
              tag: "input",
              type: "text",
              id: "username",
              label: "Username",
              value: "alice"
            }
          }
        ]
      }
    ]
  });

  assert.equal(traces.length, 1);
  assert.equal(traces[0].events.length, 2);
  assert.equal(traces[0].events[1].locator.id, "username");
});

test("generates playwright code", () => {
  const code = generateCode({
    traces: [
      {
        title: "Login",
        events: [
          { kind: "navigate", url: "https://example.com" },
          {
            kind: "click",
            element: { tag: "button", text: "Login", role: "button" }
          }
        ]
      }
    ]
  }, { target: "playwright" });

  assert.match(code, /page\.goto\("https:\/\/example\.com"\)/);
  assert.match(code, /getByRole\("button"/);
});

test("generates custom code with mapping", () => {
  const code = generateCode({
    traces: [
      {
        title: "Flow",
        events: [
          { kind: "navigate", url: "https://example.com" },
          {
            kind: "click",
            element: { tag: "button", id: "submit", text: "Go" }
          }
        ]
      }
    ]
  }, {
    target: "custom",
    mapping: {
      navigate: "this.goTo('{url}')",
      click: "this.clickElement('{selector}')"
    }
  });

  assert.match(code, /this\.goTo\('https:\/\/example\.com'\)/);
  assert.match(code, /this\.clickElement\('#submit'\)/);
});

test("pierces shadow DOM for playwright", () => {
  const code = generateCode({
    traces: [
      {
        title: "Shadow",
        events: [
          {
            kind: "click",
            element: {
              tag: "button",
              id: "inner",
              text: "Deep",
              shadowChain: ["my-host", "sub-host"]
            }
          }
        ]
      }
    ]
  }, { target: "playwright" });

  assert.match(code, /my-host >> sub-host >> #inner/);
});

test("pierces shadow DOM for cypress", () => {
  const code = generateCode({
    traces: [
      {
        title: "Shadow",
        events: [
          {
            kind: "click",
            element: {
              tag: "button",
              id: "inner",
              shadowChain: ["my-host"]
            }
          }
        ]
      }
    ]
  }, { target: "cypress" });

  assert.match(code, /cy\.get\("my-host"\)\.shadow\(\)\.find\("#inner"\)/);
});
