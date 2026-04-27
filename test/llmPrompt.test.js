"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLlmPrompt } = require("../recorder/llmPromptExport.js");

const sampleSteps = [
  { kind: "navigate", url: "https://example.com/login" },
  { kind: "fill", value: "alice@example.com", locator: { id: "email", label: "Email", css: "#email" } },
  { kind: "fill", value: "hunter2", locator: { id: "password", label: "Password", css: "#password" } },
  { kind: "click", locator: { tag: "button", text: "Sign in", css: "button[type='submit']" } },
  { kind: "assert", assertionType: "visible", locator: { css: ".welcome" } }
];

test("buildLlmPrompt embeds framework, language, persona and numbered steps", () => {
  const prompt = buildLlmPrompt(sampleSteps, {
    framework: "Playwright",
    language: "TypeScript",
    llm: "claude"
  });
  assert.match(prompt, /You are Claude/);
  assert.match(prompt, /senior test automation specialist/);
  assert.match(prompt, /\*\*Playwright\*\*/);
  assert.match(prompt, /\*\*TypeScript\*\*/);
  assert.match(prompt, /1\. Navigate to `https:\/\/example\.com\/login`\./);
  assert.match(prompt, /2\. Fill "Email" \(selector: `#email`\) with the value `alice@example\.com`\./);
  assert.match(prompt, /4\. Click on .*Sign in/);
  assert.match(prompt, /5\. Assert that .*\.welcome.* is visible\./);
});

test("buildLlmPrompt swaps persona for GPT and Gemini", () => {
  const gpt = buildLlmPrompt(sampleSteps, { llm: "gpt", framework: "Cypress", language: "JavaScript" });
  assert.match(gpt, /You are ChatGPT/);
  const gemini = buildLlmPrompt(sampleSteps, { llm: "gemini", framework: "Cypress", language: "JavaScript" });
  assert.match(gemini, /You are Gemini/);
});

test("buildLlmPrompt includes user extra notes and custom framework description", () => {
  const prompt = buildLlmPrompt(sampleSteps, {
    framework: "Custom",
    customDescription: "internal Mocha + custom driver wrapper",
    extraNotes: "Wrap in PageObjectModel; staging URL only.",
    llm: "claude",
    language: "JavaScript"
  });
  assert.match(prompt, /internal Mocha \+ custom driver wrapper/);
  assert.match(prompt, /Extra notes from the user/);
  assert.match(prompt, /Wrap in PageObjectModel/);
});

test("buildLlmPrompt translates shadow DOM chains into pierce-syntax selector strings", () => {
  const prompt = buildLlmPrompt([
    { kind: "click", locator: { css: "#inner", shadowChain: ["my-host", "sub-host"], label: "Save" } }
  ], { framework: "Playwright", language: "TypeScript", llm: "other" });
  assert.match(prompt, /my-host >> sub-host >> #inner/);
});
