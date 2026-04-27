import React, { useEffect, useState } from "react";
import { Close, Search } from "./Icons.jsx";

export default function InspectorPanel({ onClose, fullHeight = false }) {
  const [selector, setSelector] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { count, error }
  const [details, setDetails] = useState(null);

  const inspectExpr = async (expr) => {
    const s = expr.trim();
    if (!s) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await window.harness.inspector.highlight(s);
      if (!res?.ok) setResult({ count: 0, error: res?.error || "Selector failed" });
      else setResult({ count: res.count });
    } finally {
      setBusy(false);
    }
  };

  const inspect = () => inspectExpr(selector);

  useEffect(() => {
    const off = window.harness.inspector.onPicked(({ selector: picked, details: d }) => {
      if (!picked) return;
      setSelector(picked);
      setDetails(d || null);
      inspectExpr(picked);
    });
    return () => off();
  }, []);

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
        <div className="inspector__hint">
          Use <code>{`>>`}</code> for shadow DOM, e.g. <code>my-host {`>>`} #inner</code>.
          <br />
          <strong>Right-click any element</strong> in the page to pick its selector automatically.
        </div>
        {details && <ElementDetails details={details} />}
      </div>
    </div>
  );
}

function ElementDetails({ details }) {
  const rows = [];
  const push = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    rows.push({ label, value: String(value) });
  };
  push("tag", details.tag);
  push("id", details.id);
  push("class", (details.classes || []).join(" "));
  push("role", details.role);
  push("type", details.type);
  if (details.checked !== null) push("checked", details.checked ? "true" : "false");
  if (details.disabled) push("disabled", "true");
  if (details.readonly) push("readonly", "true");
  push("visible", details.visible ? "true" : "false");
  push("value", details.value);
  push("text", details.text);
  if (details.rect) push("rect", `${details.rect.x}, ${details.rect.y} · ${details.rect.width}×${details.rect.height}`);
  const attrs = details.attrs || {};
  const SKIP = new Set(["id", "class", "role", "type", "value", "checked", "disabled", "readonly"]);
  const extras = Object.entries(attrs).filter(([k]) => !SKIP.has(k));
  return (
    <div className="inspector__attrs">
      <div className="inspector__attrs-title">Element details</div>
      <table className="attr-table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={`r${i}`}><td>{r.label}</td><td><code>{r.value}</code></td></tr>
          ))}
          {extras.length > 0 && (
            <tr className="attr-table__sep"><td colSpan={2}>attributes</td></tr>
          )}
          {extras.map(([k, v]) => (
            <tr key={`a${k}`}><td>{k}</td><td><code>{String(v)}</code></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
