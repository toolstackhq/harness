import React, { useState } from "react";
import { Close, Save, Copy } from "./Icons.jsx";

const LLM_PRESETS = [
  { id: "claude", label: "Claude" },
  { id: "gpt", label: "ChatGPT (GPT-4 / 5)" },
  { id: "gemini", label: "Gemini" },
  { id: "other", label: "Other / generic" }
];
const FRAMEWORK_PRESETS = [
  "Playwright", "Cypress", "Selenium", "WebdriverIO", "TestCafe", "Robot Framework",
  "k6", "Cucumber + WebDriver", "Appium", "Custom"
];
const LANGUAGE_PRESETS = ["JavaScript", "TypeScript", "Java", "Python", "C#", "Ruby", "Go"];

export default function LlmPromptDialog({ sessionId = null, onClose }) {
  const [framework, setFramework] = useState("Playwright");
  const [language, setLanguage] = useState("TypeScript");
  const [llm, setLlm] = useState("claude");
  const [extraNotes, setExtraNotes] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (action) => {
    setBusy(true);
    try {
      const r = await window.harness.sessions.exportLlmPrompt({
        id: sessionId || undefined,
        action,
        framework,
        language,
        llm,
        extraNotes,
        customDescription
      });
      if (r?.ok && r.copied) alert(`Copied ${r.length}-char prompt to clipboard.`);
      else if (r?.ok && r.path) alert(`Saved prompt → ${r.path}`);
      else if (r?.error) alert(r.error);
      if (r?.ok) onClose?.();
    } finally { setBusy(false); }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title">Build LLM prompt</div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body" style={{ background: "white", padding: 16 }}>
          <div className="field">
            <label className="field__label">Target framework</label>
            <select className="field__input" value={framework} onChange={(e) => setFramework(e.target.value)}>
              {FRAMEWORK_PRESETS.map((f) => <option key={f}>{f}</option>)}
            </select>
            {framework === "Custom" && (
              <input
                className="field__input"
                placeholder="Describe your framework / runner / config"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                style={{ marginTop: 6 }}
              />
            )}
          </div>
          <div className="field">
            <label className="field__label">Language</label>
            <select className="field__input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGE_PRESETS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Target LLM</label>
            <select className="field__input" value={llm} onChange={(e) => setLlm(e.target.value)}>
              {LLM_PRESETS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <div className="field__help">Adjusts persona phrasing — output format stays consistent.</div>
          </div>
          <div className="field">
            <label className="field__label">Extra notes (optional)</label>
            <textarea
              className="field__textarea"
              placeholder="e.g. wrap in a Page Object Model, add Cucumber-style data tables, target staging URL only…"
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--secondary" onClick={() => submit("save")} disabled={busy}>
            <Save size={14} /> Save as .txt
          </button>
          <button className="btn btn--primary" onClick={() => submit("copy")} disabled={busy}>
            <Copy size={14} /> Copy to clipboard
          </button>
        </div>
      </div>
    </div>
  );
}
