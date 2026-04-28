"use strict";

function describeStep(step, idx) {
  const n = `${idx + 1}.`;
  const loc = step.locator || {};
  const chain = Array.isArray(loc.shadowChain) ? loc.shadowChain : [];
  const sel = loc.css || loc.xpath || "";
  const fullSel = chain.length ? `${chain.join(" >> ")} >> ${sel}` : sel;
  const label = loc.label || loc.name || loc.ariaLabel || loc.placeholder || loc.text || loc.id || "";
  const target = label ? `"${label}" (selector: \`${fullSel || "n/a"}\`)` : `selector \`${fullSel || "n/a"}\``;

  switch (step.kind) {
    case "navigate":
      return `${n} Navigate to \`${step.url}\`.`;
    case "note":
      return `${n} (Tester note: ${step.text || ""})`;
    case "wait":
      return `${n} Wait ${Number(step.ms) || 0} ms before continuing.`;
    case "capture":
      return `${n} (Annotated screenshot of ${step.text || "an area"} captured here.)`;
    case "click":
      return `${n} Click on ${target}.`;
    case "submit":
      return `${n} Submit the form via ${target}.`;
    case "fill":
      return `${n} Fill ${target} with the value \`${String(step.value ?? "")}\`.`;
    case "select":
      return `${n} Select option \`${String(step.value ?? "")}\` from the dropdown ${target}.`;
    case "check":
      return `${n} ${step.checked ? "Check" : "Uncheck"} the checkbox/radio ${target}.`;
    case "press":
      return `${n} Press the \`${step.key || "Enter"}\` key while focused on ${target}.`;
    case "assert": {
      const t = step.assertionType || "visible";
      const exp = step.expected ?? "";
      if (t === "visible") return `${n} Assert that ${target} is visible.`;
      if (t === "hidden") return `${n} Assert that ${target} is hidden.`;
      if (t === "text") return `${n} Assert that ${target} has text equal to \`${exp}\`.`;
      if (t === "contains") return `${n} Assert that ${target} contains the text \`${exp}\`.`;
      if (t === "value") return `${n} Assert that ${target} has the value \`${exp}\`.`;
      return `${n} Assert ${t} on ${target}.`;
    }
    default:
      return `${n} Perform a ${step.kind} action on ${target}.`;
  }
}

const LLM_PHRASING = {
  claude: "You are Claude. Reason carefully but keep the final code production-quality, idiomatic, and minimal.",
  gpt: "You are ChatGPT. Produce production-quality, idiomatic code. Skip preamble; show the file content first, explanation second.",
  gemini: "You are Gemini. Produce production-quality, idiomatic code. Lead with the file, then a short rationale.",
  other: "You are an expert test automation engineer."
};

function buildLlmPrompt(steps, options = {}) {
  const framework = String(options.framework || "playwright").trim();
  const language = String(options.language || "javascript").trim();
  const llm = String(options.llm || "other").toLowerCase();
  const context = String(options.context || "existing").toLowerCase();
  const extraNotes = String(options.extraNotes || "").trim();
  const customDescription = String(options.customDescription || "").trim();
  const persona = LLM_PHRASING[llm] || LLM_PHRASING.other;

  const lines = [];
  lines.push(persona);
  lines.push("You are also a senior test automation specialist.");
  lines.push("");
  lines.push(`# Task`);
  lines.push(`Convert the recorded user flow below into a runnable **${framework}** test, written in **${language}**.`);
  if (customDescription) {
    lines.push("");
    lines.push(`Framework / runtime details supplied by the user: ${customDescription}`);
  }
  lines.push("");
  lines.push("## Project context");
  if (context === "new") {
    lines.push("- This will land in a **fresh / empty project**. Scaffold whatever is needed: package.json, framework install command, config file, tsconfig if relevant, folder layout, and a runnable test file.");
    lines.push("- Pick reasonable, idiomatic defaults — do not invent a custom in-house structure.");
    lines.push("- Output every file as its own fenced block prefixed with the file path, e.g. `// path: tests/login.spec.ts`.");
    lines.push("- Include the exact install + run commands at the end (e.g. `npm i -D @playwright/test && npx playwright test`).");
  } else {
    lines.push("- This will land in an **existing test suite**. Assume the framework, runner, base URL config, fixtures, helpers and folder convention are already set up.");
    lines.push("- Do NOT regenerate package.json, framework config, tsconfig, .env, or CI workflows. Do not change any existing file unless strictly necessary.");
    lines.push("- Match whatever Page Object / fixture / data-builder pattern the existing suite uses if hinted in the notes below; otherwise stay close to the framework's idiomatic test shape.");
    lines.push("- Output a single new test file as one fenced block, prefixed with the suggested file path comment.");
  }
  lines.push("");
  lines.push("## Requirements");
  lines.push("- Use the exact selectors provided. Prefer the most stable form (id / data-testid / role) when there are alternatives.");
  lines.push("- Treat any value that looks like sample data (emails, names, account numbers) as a parameter. Hoist it to a constant or test parameter at the top of the file.");
  lines.push("- Add explicit waits for visibility / network idle where appropriate; do not insert blind sleeps unless the recorded flow had a wait step.");
  lines.push("- For shadow DOM selectors written as `host >> child`, translate them into the framework's pierce syntax (e.g. Playwright's `>>`, Cypress `.shadow().find()`, Selenium's JS executor).");
  lines.push("- Wrap the whole flow in a single test or describe block named after the recorded URL.");
  lines.push("- If the framework needs imports / driver bootstrap, generate them. If driver setup depends on the user's machine (Selenium-Java for instance), explicitly call that out as a comment.");
  lines.push("- After the code, give a 2-3 line explanation of any assumption you made. No marketing.");
  if (extraNotes) {
    lines.push("");
    lines.push("## Extra notes from the user");
    lines.push(extraNotes);
  }
  lines.push("");
  lines.push("## Recorded flow");
  if (!steps.length) {
    lines.push("(No steps recorded.)");
  } else {
    steps.forEach((step, idx) => {
      lines.push(describeStep(step, idx));
    });
  }
  lines.push("");
  lines.push("Return the test now.");
  return lines.join("\n");
}

module.exports = { buildLlmPrompt };
