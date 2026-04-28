import React, { useEffect, useRef, useState } from "react";
import { Code, Save, Copy, Play } from "./Icons.jsx";
import LlmPromptDialog from "./LlmPromptDialog.jsx";

export default function ActiveExportMenu({ session, stepCount, onGenerateScript, onExportWalkthrough }) {
  const [open, setOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const disabled = stepCount === 0 || !session.stopped;
  const tip = !session.stopped ? "Stop recording first" : (stepCount === 0 ? "No steps yet" : "Open export menu");

  const exportSelectors = async (format) => {
    setBusy(true);
    setOpen(false);
    try {
      const r = await window.harness.sessions.exportSelectors({ format });
      if (r?.ok) alert(`Saved ${r.count} selectors → ${r.path}`);
      else if (r?.error) alert(r.error);
    } finally { setBusy(false); }
  };

  const isDoc = session.recordType === "doc";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn btn--primary"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        title={tip}
      >
        <Save size={16} /> Export {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="export-menu" style={{ right: 0, bottom: "auto", top: "calc(100% + 6px)" }}>
          {!isDoc && (
            <div className="export-menu__section">
              <div className="export-menu__title">Test script</div>
              <div className="export-menu__hint">Direct codegen for the framework picked when starting this session.</div>
              <button className="export-menu__item" onClick={() => { setOpen(false); onGenerateScript?.(); }}>
                <Code size={14} /> Generate script…
              </button>
            </div>
          )}
          <div className="export-menu__section">
            <div className="export-menu__title">Walkthrough doc</div>
            <div className="export-menu__hint">Annotated screenshots → HTML / PDF / Markdown / WebM / MP4.</div>
            <button className="export-menu__item" onClick={() => { setOpen(false); onExportWalkthrough?.(); }}>
              <Play size={14} /> Open walkthrough export…
            </button>
          </div>
          <div className="export-menu__section">
            <div className="export-menu__title">Selectors</div>
            <div className="export-menu__hint">For object-repository workflows. Two columns: name + selector.</div>
            <div className="export-menu__row">
              {["csv", "json", "yaml", "xml"].map((f) => (
                <button key={f} className="export-menu__chip" onClick={() => exportSelectors(f)}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="export-menu__section">
            <div className="export-menu__title">LLM prompt</div>
            <div className="export-menu__hint">Hand off to Claude / GPT / Gemini for any framework — useful for runners Harness doesn't ship directly.</div>
            <button className="export-menu__item" onClick={() => { setOpen(false); setLlmOpen(true); }}>
              <Copy size={14} /> Build LLM prompt…
            </button>
          </div>
        </div>
      )}
      {llmOpen && <LlmPromptDialog sessionId={null} onClose={() => setLlmOpen(false)} />}
    </div>
  );
}
