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

test("note steps render as inline comments", () => {
  const code = generateCode({
    traces: [
      {
        events: [
          { kind: "navigate", url: "https://example.com" },
          { kind: "note", text: "Verify login wires to /auth" },
          { kind: "click", element: { tag: "div", id: "tile" } }
        ]
      }
    ]
  }, { target: "playwright" });

  assert.match(code, /\/\/ Verify login wires to \/auth/);
  assert.match(code, /await page\.goto/);
  assert.match(code, /#tile/);
});

test("multi-line notes preserve line-by-line comment prefix", () => {
  const code = generateCode({
    traces: [
      {
        events: [
          { kind: "note", text: "first line\nsecond line\nthird" }
        ]
      }
    ]
  }, { target: "playwright" });

  assert.match(code, /\/\/ first line/);
  assert.match(code, /\/\/ second line/);
  assert.match(code, /\/\/ third/);
});

test("wait step emits framework-native timeout call", () => {
  const events = [{ kind: "wait", ms: 750 }];
  const pw = generateCode({ traces: [{ events }] }, { target: "playwright" });
  const cy = generateCode({ traces: [{ events }] }, { target: "cypress" });
  const se = generateCode({ traces: [{ events }] }, { target: "selenium" });
  assert.match(pw, /await page\.waitForTimeout\(750\)/);
  assert.match(cy, /cy\.wait\(750\)/);
  assert.match(se, /await driver\.sleep\(750\)/);
});

test("playwright assertions render expect() calls per kind", () => {
  const events = [
    { kind: "assert", assertionType: "visible", locator: { css: "#a" } },
    { kind: "assert", assertionType: "text", expected: "Welcome", locator: { css: "#b" } },
    { kind: "assert", assertionType: "contains", expected: "ok", locator: { css: "#c" } },
    { kind: "assert", assertionType: "value", expected: "alice", locator: { css: "#d" } },
    { kind: "assert", assertionType: "hidden", locator: { css: "#e" } }
  ];
  const code = generateCode({ traces: [{ events }] }, { target: "playwright" });
  assert.match(code, /import \{ chromium, expect \} from "@playwright\/test"/);
  assert.match(code, /toBeVisible\(\)/);
  assert.match(code, /toHaveText\("Welcome"\)/);
  assert.match(code, /toContainText\("ok"\)/);
  assert.match(code, /toHaveValue\("alice"\)/);
  assert.match(code, /toBeHidden\(\)/);
});

test("cypress assertions render .should() chains per kind", () => {
  const events = [
    { kind: "assert", assertionType: "visible", locator: { css: "#a" } },
    { kind: "assert", assertionType: "text", expected: "Hi", locator: { css: "#b" } },
    { kind: "assert", assertionType: "contains", expected: "hello", locator: { css: "#c" } }
  ];
  const code = generateCode({ traces: [{ events }] }, { target: "cypress" });
  assert.match(code, /should\('be\.visible'\)/);
  assert.match(code, /should\('have\.text', "Hi"\)/);
  assert.match(code, /should\('contain', "hello"\)/);
});

test("custom assertion mapping uses assertVisible/assertText keys", () => {
  const events = [
    { kind: "assert", assertionType: "visible", locator: { css: "#x" } },
    { kind: "assert", assertionType: "text", expected: "Done", locator: { css: "#y" } }
  ];
  const code = generateCode({ traces: [{ events }] }, {
    target: "custom",
    mapping: {
      assertVisible: "this.expectVisible('{selector}')",
      assertText: "this.expectText('{selector}', '{expected}')"
    }
  });
  assert.match(code, /this\.expectVisible\('#x'\);/);
  assert.match(code, /this\.expectText\('#y', 'Done'\);/);
});

test("fill values are extracted as named const declarations", () => {
  const events = [
    { kind: "navigate", url: "https://x" },
    { kind: "fill", value: "alice", element: { tag: "input", label: "Username" } },
    { kind: "fill", value: "1234", element: { tag: "input", label: "PIN" } }
  ];
  const code = generateCode({ traces: [{ events }] }, { target: "playwright" });
  assert.match(code, /const USERNAME = "alice";/);
  assert.match(code, /const PIN = "1234";/);
  // The fill calls should reference the constant, not the literal
  assert.match(code, /\.fill\(USERNAME\)/);
  assert.match(code, /\.fill\(PIN\)/);
});

test("constant names dedupe with numeric suffixes on collision", () => {
  const events = [
    { kind: "fill", value: "v1", element: { tag: "input", label: "Field" } },
    { kind: "fill", value: "v2", element: { tag: "input", label: "Field" } }
  ];
  const code = generateCode({ traces: [{ events }] }, { target: "playwright" });
  assert.match(code, /const FIELD = "v1";/);
  assert.match(code, /const FIELD_2 = "v2";/);
});

test("capture steps render only as comments in generated scripts", () => {
  const events = [
    { kind: "navigate", url: "https://x" },
    { kind: "capture", text: "Call out the balance row", screenshot: "data:image/png;base64,xxx", rect: { x: 10, y: 20, width: 100, height: 30 } },
    { kind: "click", element: { tag: "button", id: "go" } }
  ];
  const code = generateCode({ traces: [{ events }] }, { target: "playwright" });
  assert.match(code, /\/\/ \[annotated capture\] Call out the balance row/);
  // capture is documentation only — must not emit any action call
  assert.doesNotMatch(code, /capture\(\)/);
});

test("selenium press emits Key.ENTER via Input.dispatchKeyEvent equivalent", () => {
  const code = generateCode({
    traces: [
      {
        events: [
          { kind: "press", key: "Enter", element: { tag: "input", id: "search" } }
        ]
      }
    ]
  }, { target: "selenium" });
  assert.match(code, /sendKeys\(Key\.ENTER\)/);
});

test("checkbox check vs uncheck render the right Playwright method", () => {
  const code = generateCode({
    traces: [
      {
        events: [
          { kind: "check", checked: true, element: { tag: "input", type: "checkbox", id: "tos" } },
          { kind: "check", checked: false, element: { tag: "input", type: "checkbox", id: "marketing" } }
        ]
      }
    ]
  }, { target: "playwright" });
  // Checkboxes resolve to role-based locators by default; we just care that
  // .check() and .uncheck() are picked correctly per the `checked` flag.
  assert.match(code, /\.check\(\)/);
  assert.match(code, /\.uncheck\(\)/);
});

test("custom mapping falls back to defaults when keys are missing", () => {
  // Only override `click`; everything else should use the built-in default templates.
  const code = generateCode({
    traces: [
      {
        events: [
          { kind: "navigate", url: "https://x" },
          { kind: "click", element: { tag: "button", id: "go" } },
          { kind: "fill", value: "alice", element: { tag: "input", id: "user" } }
        ]
      }
    ]
  }, { target: "custom", mapping: { click: "myClick('{selector}')" } });
  assert.match(code, /myClick\('#go'\);/);                    // overridden
  assert.match(code, /await this\.goTo\('https:\/\/x'\);/);   // default fallback
  assert.match(code, /await this\.typeInto\('#user', 'alice'\);/); // default fallback
});

test("unsupported target throws an explicit error", () => {
  assert.throws(
    () => generateCode({ traces: [{ events: [{ kind: "navigate", url: "https://x" }] }] }, { target: "kotlin" }),
    /Unsupported target/
  );
});

test("normalizeTrace keeps wait, note, assert, capture kinds and drops invalid ones", () => {
  const traces = normalizeTrace({
    traces: [
      {
        events: [
          { kind: "wait", ms: 500 },
          { kind: "wait", ms: 0 }, // dropped: zero ms
          { kind: "note", text: "hi" },
          { kind: "note", text: "" },  // dropped: empty
          { kind: "assert", assertionType: "visible", locator: { css: "#x" } },
          { kind: "assert", locator: { css: "" } }, // dropped: no selector
          { kind: "capture", text: "ok", rect: { x: 0, y: 0, width: 50, height: 50 } },
          { kind: "click" }, // dropped: no element / locator
          { kind: "click", element: { tag: "button", id: "ok" } }
        ]
      }
    ]
  });
  const kinds = traces[0].events.map((e) => e.kind);
  assert.deepEqual(kinds, ["wait", "note", "assert", "capture", "click"]);
});
