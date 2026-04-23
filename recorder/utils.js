"use strict";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeString(value) {
  return JSON.stringify(String(value ?? ""));
}

function toIdentifier(value, fallback = "step") {
  const raw = String(value ?? "")
    .replace(/['"`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const base = raw
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower.replace(/^[^a-zA-Z_$]+/, "");
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");

  const safe = base || fallback;
  return /^[a-zA-Z_$]/.test(safe) ? safe : `${fallback}${safe}`;
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pluralize(count, word) {
  return count === 1 ? word : `${word}s`;
}

module.exports = { isObject, escapeString, toIdentifier, normalizeWhitespace, pluralize };
