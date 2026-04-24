"use strict";

const { buildLocatorSnapshot, chooseLocatorForFramework } = require("./locator.js");
const { escapeString, isObject } = require("./utils.js");

function normalizeTarget(target) {
  return typeof target === "string" ? target : String(target ?? "playwright");
}

function pickEvents(trace) {
  if (!trace) return [];
  if (Array.isArray(trace.events)) return trace.events;
  if (Array.isArray(trace.steps)) return trace.steps;
  return [];
}

function normalizeTrace(input) {
  const traces = [];
  const rawTraces = Array.isArray(input)
    ? input
    : Array.isArray(input?.traces)
      ? input.traces
      : Array.isArray(input?.targets)
        ? input.targets
        : input && isObject(input) && Array.isArray(input.events)
          ? [{ ...input, events: input.events }]
          : [];

  for (const trace of rawTraces) {
    const events = pickEvents(trace);
    const normalized = [];
    for (const event of events) {
      if (!event || !event.kind) continue;
      if (event.kind === "navigate") {
        const url = String(event.url ?? "").trim();
        if (!url) continue;
        const last = normalized[normalized.length - 1];
        if (last?.kind === "navigate" && last.url === url) continue;
        normalized.push({
          kind: "navigate",
          url,
          title: String(event.title ?? "").trim(),
          ts: Number(event.ts ?? Date.now()),
          targetId: event.targetId ?? trace.targetId ?? "",
          screenshot: event.screenshot
        });
        continue;
      }
      if (event.kind === "note") {
        const text = String(event.text ?? "").trim();
        if (!text) continue;
        normalized.push({
          kind: "note",
          text,
          ts: Number(event.ts ?? Date.now()),
          targetId: event.targetId ?? trace.targetId ?? "",
          url: String(event.url ?? trace.url ?? "").trim(),
          screenshot: event.screenshot,
          number: event.number
        });
        continue;
      }
      if (event.kind === "wait") {
        const ms = Math.max(0, Number(event.ms) || 0);
        if (!ms) continue;
        normalized.push({
          kind: "wait",
          ms,
          ts: Number(event.ts ?? Date.now()),
          targetId: event.targetId ?? trace.targetId ?? "",
          number: event.number
        });
        continue;
      }
      if (event.kind === "capture") {
        normalized.push({
          kind: "capture",
          text: String(event.text ?? "").trim(),
          rect: event.rect || null,
          screenshot: event.screenshot,
          ts: Number(event.ts ?? Date.now()),
          targetId: event.targetId ?? trace.targetId ?? "",
          url: String(event.url ?? trace.url ?? "").trim(),
          number: event.number
        });
        continue;
      }
      if (event.kind === "assert") {
        const selector = String(event.locator?.css ?? event.selector ?? "").trim();
        if (!selector) continue;
        normalized.push({
          kind: "assert",
          assertionType: event.assertionType || "visible",
          expected: event.expected ?? "",
          locator: event.locator || { css: selector, shadowChain: [] },
          ts: Number(event.ts ?? Date.now()),
          targetId: event.targetId ?? trace.targetId ?? "",
          screenshot: event.screenshot,
          number: event.number
        });
        continue;
      }
      if (!event.element && !event.locator) continue;
      const locator = event.locator ? event.locator : buildLocatorSnapshot(event.element);
      normalized.push({
        kind: event.kind,
        ts: Number(event.ts ?? Date.now()),
        targetId: event.targetId ?? trace.targetId ?? "",
        url: String(event.url ?? trace.url ?? "").trim(),
        title: String(event.title ?? trace.title ?? "").trim(),
        value: event.value ?? event.element?.value ?? "",
        checked: typeof event.checked === "boolean" ? event.checked : event.element?.checked,
        key: event.key ?? "",
        locator,
        element: event.element ?? {}
      });
    }
    traces.push({
      targetId: trace.targetId ?? "",
      url: String(trace.url ?? "").trim(),
      title: String(trace.title ?? "").trim(),
      events: normalized
    });
  }
  return traces;
}

function renderPlaywrightLocator(locator) {
  const chain = Array.isArray(locator.shadowChain) ? locator.shadowChain : [];
  if (chain.length > 0) {
    const leaf = locator.css || (locator.xpath ? `xpath=${locator.xpath}` : "*");
    const combined = [...chain, leaf].join(" >> ");
    return `page.locator(${escapeString(combined)})`;
  }
  const resolved = chooseLocatorForFramework(locator, "playwright");
  switch (resolved.kind) {
    case "role":
      return `page.getByRole(${escapeString(resolved.role)}, { name: ${escapeString(resolved.name || "")} })`;
    case "label":
      return `page.getByLabel(${escapeString(resolved.label)})`;
    case "placeholder":
      return `page.getByPlaceholder(${escapeString(resolved.placeholder)})`;
    case "text":
      return `page.getByText(${escapeString(resolved.text)}, { exact: true })`;
    case "css":
      return `page.locator(${escapeString(resolved.selector)})`;
    case "xpath":
      return `page.locator(${escapeString(`xpath=${resolved.selector}`)})`;
    default:
      return `page.locator(${escapeString(locator.css || locator.xpath || "body")})`;
  }
}

function renderCypressLocator(locator) {
  const chain = Array.isArray(locator.shadowChain) ? locator.shadowChain : [];
  const resolved = chooseLocatorForFramework(locator, "cypress");
  if (chain.length > 0) {
    const leaf = resolved.kind === "css" ? resolved.selector : locator.css || locator.xpath;
    let expr = `cy.get(${escapeString(chain[0])})`;
    for (let i = 1; i < chain.length; i += 1) {
      expr += `.shadow().find(${escapeString(chain[i])})`;
    }
    expr += `.shadow().find(${escapeString(leaf)})`;
    return expr;
  }
  switch (resolved.kind) {
    case "contains":
      return `cy.contains(${escapeString(resolved.selector)}, ${escapeString(resolved.text)})`;
    case "css":
      return `cy.get(${escapeString(resolved.selector)})`;
    case "xpath":
      return `cy.xpath(${escapeString(resolved.selector)})`;
    default:
      return `cy.get(${escapeString(locator.css || locator.xpath || "body")})`;
  }
}

function renderSeleniumLocator(locator) {
  const chain = Array.isArray(locator.shadowChain) ? locator.shadowChain : [];
  const resolved = chooseLocatorForFramework(locator, "selenium");
  if (chain.length > 0) {
    const leaf = resolved.kind === "css" ? resolved.selector : locator.css || locator.xpath;
    const steps = [...chain, leaf];
    const pierced = steps
      .map((sel, index) =>
        index === 0
          ? `document.querySelector(${escapeString(sel)})`
          : `.shadowRoot.querySelector(${escapeString(sel)})`)
      .join("");
    return { kind: "shadowJs", script: `return ${pierced};` };
  }
  switch (resolved.kind) {
    case "css":
      return { kind: "by", expr: `By.css(${escapeString(resolved.selector)})` };
    case "xpath":
      return { kind: "by", expr: `By.xpath(${escapeString(resolved.selector)})` };
    default:
      return { kind: "by", expr: `By.css(${escapeString(locator.css || locator.xpath || "body")})` };
  }
}

function interpolate(template, bindings) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const val = bindings[key];
    return val === undefined ? "" : String(val);
  });
}

function customBindings(step) {
  const locator = step.locator || {};
  const chain = Array.isArray(locator.shadowChain) ? locator.shadowChain : [];
  const selector = chain.length > 0
    ? [...chain, locator.css || locator.xpath || ""].join(" >> ")
    : locator.css || locator.xpath || "";
  return {
    selector,
    css: locator.css || "",
    xpath: locator.xpath || "",
    url: step.url || "",
    value: step.value ?? "",
    key: step.key || "Enter",
    role: locator.role || "",
    label: locator.label || "",
    text: locator.text || "",
    placeholder: locator.placeholder || "",
    name: locator.name || "",
    checked: String(Boolean(step.checked))
  };
}

function commentLines(text, indent = "    ") {
  return String(text || "").split("\n").map((line) => `${indent}// ${line}`).join("\n");
}

function toConstName(base, used) {
  let id = String(base || "VALUE")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!id) id = "VALUE";
  if (!/^[A-Z_]/.test(id)) id = `V_${id}`;
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}_${n++}`;
  used.add(candidate);
  return candidate;
}

function extractInputVariables(trace) {
  const used = new Set();
  const byIndex = new Map();
  const declarations = [];
  trace.events.forEach((step, idx) => {
    if (step.kind !== "fill" && step.kind !== "select") return;
    const loc = step.locator || {};
    const base = loc.label || loc.name || loc.ariaLabel || loc.placeholder || loc.id || loc.css || step.kind;
    const name = toConstName(base, used);
    byIndex.set(idx, name);
    declarations.push({ name, value: String(step.value ?? "") });
  });
  return { byIndex, declarations };
}

function renderPlaywrightAssertion(step) {
  const loc = step.locator || {};
  const base = renderPlaywrightLocator(loc);
  const expected = step.expected ?? "";
  switch (step.assertionType) {
    case "hidden": return `    await expect(${base}).toBeHidden();`;
    case "text": return `    await expect(${base}).toHaveText(${escapeString(expected)});`;
    case "contains": return `    await expect(${base}).toContainText(${escapeString(expected)});`;
    case "value": return `    await expect(${base}).toHaveValue(${escapeString(expected)});`;
    case "visible":
    default: return `    await expect(${base}).toBeVisible();`;
  }
}

function renderPlaywright(trace) {
  const hasAsserts = trace.events.some((s) => s.kind === "assert");
  const { byIndex, declarations } = extractInputVariables(trace);
  const lines = [
    hasAsserts
      ? `import { chromium, expect } from "@playwright/test";`
      : `import { chromium } from "playwright";`,
    ""
  ];
  if (declarations.length) {
    lines.push("// Edit these to parameterise the flow.");
    for (const d of declarations) lines.push(`const ${d.name} = ${escapeString(d.value)};`);
    lines.push("");
  }
  lines.push(
    "(async () => {",
    "  const browser = await chromium.launch({ headless: false });",
    "  const page = await browser.newPage();",
    "  try {"
  );
  for (const [i, step] of trace.events.entries()) {
    if (step.kind === "note") {
      lines.push(commentLines(step.text));
      continue;
    }
    if (step.kind === "capture") {
      if (step.text) lines.push(commentLines(`[annotated capture] ${step.text}`));
      continue;
    }
    if (step.kind === "wait") {
      lines.push(`    await page.waitForTimeout(${Number(step.ms) || 0});`);
      continue;
    }
    if (step.kind === "assert") {
      lines.push(renderPlaywrightAssertion(step));
      continue;
    }
    if (step.kind === "navigate") {
      lines.push(`    await page.goto(${escapeString(step.url)});`);
      continue;
    }
    const loc = step.locator || {};
    const l = renderPlaywrightLocator(loc);
    const varName = byIndex.get(i);
    if (step.kind === "click") lines.push(`    await ${l}.click();`);
    else if (step.kind === "fill") lines.push(`    await ${l}.fill(${varName || escapeString(step.value ?? "")});`);
    else if (step.kind === "select") lines.push(`    await ${l}.selectOption(${varName || escapeString(step.value ?? "")});`);
    else if (step.kind === "check") lines.push(`    await ${l}.${step.checked ? "check" : "uncheck"}();`);
    else if (step.kind === "press") lines.push(`    await ${l}.press(${escapeString(step.key || "Enter")});`);
    else if (step.kind === "submit") lines.push(`    await ${l}.click();`);
  }
  lines.push("  } finally {", "    await browser.close();", "  }", "})();");
  return lines.join("\n");
}

function renderCypressAssertion(step) {
  const loc = step.locator || {};
  const base = renderCypressLocator(loc);
  const expected = step.expected ?? "";
  switch (step.assertionType) {
    case "hidden": return `    ${base}.should('not.be.visible');`;
    case "text": return `    ${base}.should('have.text', ${escapeString(expected)});`;
    case "contains": return `    ${base}.should('contain', ${escapeString(expected)});`;
    case "value": return `    ${base}.should('have.value', ${escapeString(expected)});`;
    case "visible":
    default: return `    ${base}.should('be.visible');`;
  }
}

function renderCypress(trace) {
  const { byIndex, declarations } = extractInputVariables(trace);
  const lines = [];
  if (declarations.length) {
    lines.push("// Edit these to parameterise the flow.");
    for (const d of declarations) lines.push(`const ${d.name} = ${escapeString(d.value)};`);
    lines.push("");
  }
  lines.push(`describe(${escapeString(trace.title || "recorded flow")}, () => {`, `  it('replays the flow', () => {`);
  for (const [i, step] of trace.events.entries()) {
    if (step.kind === "note") {
      lines.push(commentLines(step.text));
      continue;
    }
    if (step.kind === "capture") {
      if (step.text) lines.push(commentLines(`[annotated capture] ${step.text}`));
      continue;
    }
    if (step.kind === "wait") {
      lines.push(`    cy.wait(${Number(step.ms) || 0});`);
      continue;
    }
    if (step.kind === "assert") {
      lines.push(renderCypressAssertion(step));
      continue;
    }
    if (step.kind === "navigate") {
      lines.push(`    cy.visit(${escapeString(step.url)});`);
      continue;
    }
    const loc = step.locator || {};
    const l = renderCypressLocator(loc);
    const varName = byIndex.get(i);
    if (step.kind === "click") lines.push(`    ${l}.click();`);
    else if (step.kind === "fill") lines.push(`    ${l}.clear().type(${varName || escapeString(step.value ?? "")});`);
    else if (step.kind === "select") lines.push(`    ${l}.select(${varName || escapeString(step.value ?? "")});`);
    else if (step.kind === "check") lines.push(`    ${l}.${step.checked ? "check" : "uncheck"}();`);
    else if (step.kind === "press") lines.push(`    ${l}.type(${escapeString(`{${(step.key || "enter").toLowerCase()}}`)});`);
    else if (step.kind === "submit") lines.push(`    ${l}.click();`);
  }
  lines.push("  });", "});");
  return lines.join("\n");
}

function renderSeleniumAssertion(step) {
  const loc = step.locator || {};
  const sel = renderSeleniumLocator(loc);
  const ref = sel.kind === "shadowJs"
    ? `(async () => { const el = await driver.executeScript(${escapeString(sel.script)}); return el; })()`
    : `driver.findElement(${sel.expr})`;
  const expected = JSON.stringify(String(step.expected ?? ""));
  switch (step.assertionType) {
    case "hidden": return `    { const el = await ${ref}; if (await el.isDisplayed()) throw new Error('Expected hidden'); }`;
    case "text": return `    { const el = await ${ref}; if ((await el.getText()).trim() !== ${expected}) throw new Error('Text mismatch'); }`;
    case "contains": return `    { const el = await ${ref}; if (!(await el.getText()).includes(${expected})) throw new Error('Text does not contain'); }`;
    case "value": return `    { const el = await ${ref}; if ((await el.getAttribute('value')) !== ${expected}) throw new Error('Value mismatch'); }`;
    case "visible":
    default: return `    { const el = await ${ref}; if (!(await el.isDisplayed())) throw new Error('Expected visible'); }`;
  }
}

function renderSelenium(trace) {
  const { byIndex, declarations } = extractInputVariables(trace);
  const lines = [
    'import { Builder, By, Key } from "selenium-webdriver";',
    ""
  ];
  if (declarations.length) {
    lines.push("// Edit these to parameterise the flow.");
    for (const d of declarations) lines.push(`const ${d.name} = ${escapeString(d.value)};`);
    lines.push("");
  }
  lines.push(
    "(async () => {",
    "  const driver = await new Builder().forBrowser('chrome').build();",
    "  try {"
  );
  for (const [i, step] of trace.events.entries()) {
    if (step.kind === "note") {
      lines.push(commentLines(step.text));
      continue;
    }
    if (step.kind === "capture") {
      if (step.text) lines.push(commentLines(`[annotated capture] ${step.text}`));
      continue;
    }
    if (step.kind === "wait") {
      lines.push(`    await driver.sleep(${Number(step.ms) || 0});`);
      continue;
    }
    if (step.kind === "assert") {
      lines.push(renderSeleniumAssertion(step));
      continue;
    }
    if (step.kind === "navigate") {
      lines.push(`    await driver.get(${escapeString(step.url)});`);
      continue;
    }
    const loc = step.locator || {};
    const sel = renderSeleniumLocator(loc);
    let ref;
    if (sel.kind === "shadowJs") {
      ref = "el";
      lines.push(`    const el = await driver.executeScript(${escapeString(sel.script)});`);
    } else {
      ref = `driver.findElement(${sel.expr})`;
    }
    const varName = byIndex.get(i);
    if (step.kind === "click") lines.push(`    await ${ref}.click();`);
    else if (step.kind === "fill") {
      lines.push(`    await ${ref}.clear();`);
      lines.push(`    await ${ref}.sendKeys(${varName || escapeString(step.value ?? "")});`);
    } else if (step.kind === "select") {
      lines.push(`    await ${ref}.sendKeys(${varName || escapeString(step.value ?? "")});`);
    } else if (step.kind === "check") {
      lines.push(`    await ${ref}.click();`);
    } else if (step.kind === "press") {
      lines.push(`    await ${ref}.sendKeys(Key.${String(step.key || "ENTER").toUpperCase()});`);
    } else if (step.kind === "submit") {
      lines.push(`    await ${ref}.click();`);
    }
  }
  lines.push("  } finally {", "    await driver.quit();", "  }", "})();");
  return lines.join("\n");
}

const DEFAULT_CUSTOM_MAPPING = {
  navigate: "await this.goTo('{url}')",
  click: "await this.clickElement('{selector}')",
  fill: "await this.typeInto('{selector}', '{value}')",
  select: "await this.selectOption('{selector}', '{value}')",
  check: "await this.setChecked('{selector}', {checked})",
  press: "await this.press('{selector}', '{key}')",
  submit: "await this.submit('{selector}')",
  note: "// {text}",
  assertVisible: "await this.expectVisible('{selector}')",
  assertHidden: "await this.expectHidden('{selector}')",
  assertText: "await this.expectText('{selector}', '{expected}')",
  assertContains: "await this.expectContains('{selector}', '{expected}')",
  assertValue: "await this.expectValue('{selector}', '{expected}')",
  wait: "await this.wait({ms})"
};

function renderCustom(trace, options = {}) {
  const mapping = { ...DEFAULT_CUSTOM_MAPPING, ...(options.mapping || {}) };
  const lines = [];
  for (const step of trace.events) {
    if (step.kind === "note") {
      const tpl = mapping.note;
      if (!tpl) continue;
      const text = String(step.text || "");
      if (tpl === "// {text}") {
        lines.push(text.split("\n").map((l) => `// ${l}`).join("\n"));
      } else {
        lines.push(interpolate(tpl, { ...customBindings(step), text }));
      }
      continue;
    }
    if (step.kind === "capture") {
      const text = String(step.text || "").trim();
      if (text) {
        lines.push(`[annotated capture] ${text}`.split("\n").map((l) => `// ${l}`).join("\n"));
      }
      continue;
    }
    if (step.kind === "wait") {
      const tpl = mapping.wait;
      if (!tpl) continue;
      lines.push(interpolate(tpl, { ms: Number(step.ms) || 0 }) + ";");
      continue;
    }
    if (step.kind === "assert") {
      const key = step.assertionType === "hidden" ? "assertHidden"
        : step.assertionType === "text" ? "assertText"
        : step.assertionType === "contains" ? "assertContains"
        : step.assertionType === "value" ? "assertValue"
        : "assertVisible";
      const tpl = mapping[key];
      if (!tpl) continue;
      const expected = String(step.expected ?? "");
      const bindings = { ...customBindings(step), expected };
      lines.push(interpolate(tpl, bindings) + ";");
      continue;
    }
    const template = mapping[step.kind];
    if (!template) continue;
    lines.push(interpolate(template, customBindings(step)) + ";");
  }
  return lines.join("\n");
}

function generateCode(input, options = {}) {
  const target = normalizeTarget(options.target || "playwright");
  const traces = normalizeTrace(input);
  const bodies = traces.map((trace) => {
    switch (target) {
      case "playwright":
      case "pw":
        return renderPlaywright(trace);
      case "cypress":
      case "cy":
        return renderCypress(trace);
      case "selenium":
      case "wd":
        return renderSelenium(trace);
      case "custom":
        return renderCustom(trace, options);
      case "all":
        return [
          "/* Playwright */", renderPlaywright(trace), "",
          "/* Cypress */", renderCypress(trace), "",
          "/* Selenium */", renderSelenium(trace), "",
          "/* Custom */", renderCustom(trace, options)
        ].join("\n");
      default:
        throw new Error(`Unsupported target: ${target}`);
    }
  });
  if (bodies.length === 1) return bodies[0];
  return bodies.map((body, i) => `// Trace ${i + 1}\n${body}`).join("\n\n");
}

module.exports = {
  normalizeTrace,
  generateCode,
  renderPlaywright,
  renderCypress,
  renderSelenium,
  renderCustom,
  DEFAULT_CUSTOM_MAPPING
};
