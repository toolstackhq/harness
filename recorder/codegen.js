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
          screenshot: event.screenshot
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

function renderPlaywright(trace) {
  const lines = [
    `import { chromium } from "playwright";`,
    "",
    "(async () => {",
    "  const browser = await chromium.launch({ headless: false });",
    "  const page = await browser.newPage();",
    "  try {"
  ];
  for (const step of trace.events) {
    if (step.kind === "note") {
      lines.push(commentLines(step.text));
      continue;
    }
    if (step.kind === "navigate") {
      lines.push(`    await page.goto(${escapeString(step.url)});`);
      continue;
    }
    const loc = step.locator || {};
    const l = renderPlaywrightLocator(loc);
    if (step.kind === "click") lines.push(`    await ${l}.click();`);
    else if (step.kind === "fill") lines.push(`    await ${l}.fill(${escapeString(step.value ?? "")});`);
    else if (step.kind === "select") lines.push(`    await ${l}.selectOption(${escapeString(step.value ?? "")});`);
    else if (step.kind === "check") lines.push(`    await ${l}.${step.checked ? "check" : "uncheck"}();`);
    else if (step.kind === "press") lines.push(`    await ${l}.press(${escapeString(step.key || "Enter")});`);
    else if (step.kind === "submit") lines.push(`    await ${l}.click();`);
  }
  lines.push("  } finally {", "    await browser.close();", "  }", "})();");
  return lines.join("\n");
}

function renderCypress(trace) {
  const lines = [`describe(${escapeString(trace.title || "recorded flow")}, () => {`, `  it('replays the flow', () => {`];
  for (const step of trace.events) {
    if (step.kind === "note") {
      lines.push(commentLines(step.text));
      continue;
    }
    if (step.kind === "navigate") {
      lines.push(`    cy.visit(${escapeString(step.url)});`);
      continue;
    }
    const loc = step.locator || {};
    const l = renderCypressLocator(loc);
    if (step.kind === "click") lines.push(`    ${l}.click();`);
    else if (step.kind === "fill") lines.push(`    ${l}.clear().type(${escapeString(step.value ?? "")});`);
    else if (step.kind === "select") lines.push(`    ${l}.select(${escapeString(step.value ?? "")});`);
    else if (step.kind === "check") lines.push(`    ${l}.${step.checked ? "check" : "uncheck"}();`);
    else if (step.kind === "press") lines.push(`    ${l}.type(${escapeString(`{${(step.key || "enter").toLowerCase()}}`)});`);
    else if (step.kind === "submit") lines.push(`    ${l}.click();`);
  }
  lines.push("  });", "});");
  return lines.join("\n");
}

function renderSelenium(trace) {
  const lines = [
    'import { Builder, By, Key } from "selenium-webdriver";',
    "",
    "(async () => {",
    "  const driver = await new Builder().forBrowser('chrome').build();",
    "  try {"
  ];
  for (const step of trace.events) {
    if (step.kind === "note") {
      lines.push(commentLines(step.text));
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
    if (step.kind === "click") lines.push(`    await ${ref}.click();`);
    else if (step.kind === "fill") {
      lines.push(`    await ${ref}.clear();`);
      lines.push(`    await ${ref}.sendKeys(${escapeString(step.value ?? "")});`);
    } else if (step.kind === "select") {
      lines.push(`    await ${ref}.sendKeys(${escapeString(step.value ?? "")});`);
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
  note: "// {text}"
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
      case "abstract":
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
