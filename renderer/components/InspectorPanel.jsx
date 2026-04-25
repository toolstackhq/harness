import React, { useState } from "react";
import { Close, Search } from "./Icons.jsx";

export default function InspectorPanel({ onClose, fullHeight = false }) {
  const [selector, setSelector] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { count, error }

  const inspect = async () => {
    const s = selector.trim();
    if (!s || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await window.harness.inspector.highlight(s);
      if (!res?.ok) {
        setResult({ count: 0, error: res?.error || "Selector failed" });
      } else {
        setResult({ count: res.count });
      }
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      inspect();
    }
  };

  return (
    <div className={`inspector${fullHeight ? " inspector--full" : ""}`}>
      <div className="inspector__header">
        <span className="inspector__title"><Search size={14} /> Inspector</span>
        {onClose && (
          <button className="inspector__x" onClick={onClose} title="Close inspector"><Close size={14} /></button>
        )}
      </div>
      <div className="inspector__body">
        <textarea
          className="inspector__input"
          placeholder="CSS selector or pierce syntax (host >> child)"
          value={selector}
          onChange={(e) => setSelector(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          rows={2}
        />
        <div className="inspector__row">
          <button className="btn btn--primary" onClick={inspect} disabled={busy || !selector.trim()} style={{ height: 30, padding: "0 12px", fontSize: 12 }}>
            {busy ? "…" : "Inspect"}
          </button>
          {result && (
            <div className={`inspector__result${result.error ? " inspector__result--err" : (result.count === 0 ? " inspector__result--miss" : " inspector__result--hit")}`}>
              {result.error ? `× ${result.error}` : result.count === 0 ? "No match" : `${result.count} match${result.count === 1 ? "" : "es"}`}
            </div>
          )}
        </div>
        <div className="inspector__hint">Use <code>{`>>`}</code> for shadow DOM, e.g. <code>my-host {`>>`} #inner</code></div>
      </div>
    </div>
  );
}
