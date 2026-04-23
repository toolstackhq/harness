"use strict";

const { normalizeWhitespace, toIdentifier } = require("./utils.js");

function cssEscape(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === "function") {
    return globalThis.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0).toString(16)} `);
}

function xpathLiteral(value) {
  const text = String(value);
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  const parts = text.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(`, "'", `)})`;
}

function siblingsIndex(tagName, index) {
  return `${tagName}:nth-of-type(${index})`;
}

function inferRole(meta) {
  const tag = String(meta.tag ?? "").toLowerCase();
  const type = String(meta.type ?? "").toLowerCase();
  const role = String(meta.role ?? "").toLowerCase();

  if (role) return role;
  if (tag === "button") return "button";
  if (tag === "a" && meta.href) return "link";
  if (tag === "input") {
    if (["button", "submit", "reset"].includes(type)) return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    if (["email", "password", "search", "tel", "text", "url", "number"].includes(type)) return "textbox";
  }
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (meta.contenteditable) return "textbox";
  return "";
}

function labelText(meta) {
  return normalizeWhitespace(meta.label || meta.ariaLabel || meta.ariaLabelledByText || "");
}

function buildLocatorSnapshot(meta = {}) {
  const tag = String(meta.tag ?? "").toLowerCase();
  const type = String(meta.type ?? "").toLowerCase();
  const name = normalizeWhitespace(meta.text || meta.label || meta.ariaLabel || meta.placeholder || meta.name || meta.id || tag);
  const role = inferRole(meta);
  const label = labelText(meta);
  const id = String(meta.id ?? "").trim();
  const nameAttr = String(meta.name ?? "").trim();
  const dataTestId = String(meta.dataTestId ?? meta.testId ?? meta["data-testid"] ?? meta["data-cy"] ?? meta["data-pw"] ?? "").trim();
  const ariaLabel = String(meta.ariaLabel ?? "").trim();
  const placeholder = String(meta.placeholder ?? "").trim();
  const text = normalizeWhitespace(meta.text ?? "");
  const href = String(meta.href ?? "").trim();
  const value = String(meta.value ?? "").trim();
  const shadowChain = Array.isArray(meta.shadowChain) ? meta.shadowChain.slice() : [];
  const inShadow = shadowChain.length > 0;

  let css = "";
  let quality = "low";
  let reason = "fallback";
  let ambiguous = false;

  if (dataTestId) {
    css = `[data-testid="${dataTestId.replace(/"/g, '\\"')}"]`;
    quality = "high";
    reason = "data-testid";
  } else if (id) {
    css = `#${cssEscape(id)}`;
    quality = "high";
    reason = "id";
  } else if (nameAttr) {
    css = `[name="${nameAttr.replace(/"/g, '\\"')}"]`;
    quality = "ok";
    reason = "name";
  } else if (ariaLabel) {
    css = `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    quality = "ok";
    reason = "aria-label";
  } else if (placeholder && ["input", "textarea"].includes(tag)) {
    css = `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
    quality = "ok";
    reason = "placeholder";
  } else if (text && ["button", "a", "label", "legend"].includes(tag)) {
    css = `${tag}:nth-of-type(1)`;
    quality = "low";
    reason = "text";
    ambiguous = true;
  } else if (tag) {
    css = siblingsIndex(tag, Number(meta.index ?? 1));
    quality = "low";
    reason = "nth-of-type";
    ambiguous = true;
  }

  const xpath =
    id
      ? `//*[@id=${xpathLiteral(id)}]`
      : dataTestId
        ? `//*[@data-testid=${xpathLiteral(dataTestId)}]`
        : nameAttr
          ? `//*[@name=${xpathLiteral(nameAttr)}]`
          : ariaLabel
            ? `//*[@aria-label=${xpathLiteral(ariaLabel)}]`
            : placeholder
              ? `//${tag || "*"}[@placeholder=${xpathLiteral(placeholder)}]`
              : text
                ? `//${tag || "*"}[normalize-space()=${xpathLiteral(text)}]`
                : `//${tag || "*"}`;

  const candidate = {
    name,
    label,
    role,
    text,
    tag,
    type,
    id,
    nameAttr,
    dataTestId,
    ariaLabel,
    placeholder,
    href,
    value,
    css,
    xpath,
    quality,
    reason,
    ambiguous,
    shadowChain,
    inShadow
  };

  const isClickable = ["button", "link", "checkbox", "radio"].includes(role) || ["button", "a"].includes(tag);
  const isFillable = ["textbox", "combobox"].includes(role) || ["input", "textarea", "select"].includes(tag);

  candidate.playwright = isClickable
    ? role
      ? { kind: "role", role, name: label || name || text || undefined }
      : text
        ? { kind: "text", text }
        : css
          ? { kind: "css", selector: css }
          : { kind: "xpath", selector: xpath }
    : isFillable
      ? label
        ? { kind: "label", label }
        : placeholder
          ? { kind: "placeholder", placeholder }
          : id || dataTestId || nameAttr || ariaLabel
            ? { kind: "css", selector: css }
            : { kind: "xpath", selector: xpath }
      : css
        ? { kind: "css", selector: css }
        : { kind: "xpath", selector: xpath };

  candidate.cypress = isClickable
    ? quality !== "low" && css
      ? { kind: "css", selector: css }
      : role === "link" && text
        ? { kind: "contains", selector: "a", text }
        : text
          ? { kind: "contains", selector: role === "button" ? "button" : tag || "*", text }
          : css
            ? { kind: "css", selector: css }
            : { kind: "xpath", selector: xpath }
    : isFillable
      ? css
        ? { kind: "css", selector: css }
        : { kind: "xpath", selector: xpath }
      : css
        ? { kind: "css", selector: css }
        : { kind: "xpath", selector: xpath };

  candidate.selenium = css
    ? { kind: "css", selector: css }
    : { kind: "xpath", selector: xpath };

  candidate.abstract = {
    kind: candidate.playwright.kind,
    role,
    label,
    text,
    css,
    xpath
  };

  return candidate;
}

function chooseLocatorForFramework(snapshot, framework) {
  const resolved = snapshot[framework];
  if (resolved) return resolved;
  return snapshot.selenium || snapshot.playwright || snapshot.cypress || { kind: "css", selector: snapshot.css || snapshot.xpath };
}

function toStepName(step, index) {
  const base = step.kind === "navigate"
    ? "openPage"
    : step.kind === "fill"
      ? step.label || step.name || "field"
      : step.kind === "select"
        ? step.label || step.name || "select"
        : step.kind === "check"
          ? step.label || step.name || "checkbox"
          : step.kind === "press"
            ? step.label || step.name || step.key || "press"
            : step.label || step.name || step.text || step.tag || "action";
  return toIdentifier(`${base} ${index + 1}`, "step");
}

function formatShadowChainSelector(chain, leaf) {
  if (!Array.isArray(chain) || chain.length === 0) return leaf;
  return [...chain, leaf].join(" >> ");
}

module.exports = {
  buildLocatorSnapshot,
  chooseLocatorForFramework,
  toStepName,
  inferRole,
  formatShadowChainSelector
};
