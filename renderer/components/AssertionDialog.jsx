import React, { useEffect, useRef, useState } from "react";
import { Close, Save, Assert } from "./Icons.jsx";

const TYPES = [
  { id: "visible",  label: "is visible",       needsExpected: false },
  { id: "hidden",   label: "is hidden",        needsExpected: false },
  { id: "text",     label: "has exact text",   needsExpected: true  },
  { id: "contains", label: "contains text",    needsExpected: true  },
  { id: "value",    label: "has value",        needsExpected: true  }
];

export default function AssertionDialog({ defaultSelector, onSave, onClose }) {
  const [selector, setSelector] = useState(defaultSelector || "");
  const [type, setType] = useState("visible");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const active = TYPES.find((t) => t.id === type) || TYPES[0];

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (busy || !selector.trim()) return;
    setBusy(true);
    try {
      const ok = await onSave?.({ selector: selector.trim(), assertionType: type, expected });
      if (ok !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title"><Assert size={16} /> Add assertion</div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body" style={{ background: "white", padding: 16 }}>
          <div className="field">
            <label className="field__label">Selector</label>
            <input
              ref={ref}
              className="field__input field__input--mono"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              spellCheck={false}
              placeholder="#login-button or [data-testid=submit]"
            />
            {defaultSelector && (
              <div className="field__help">
                Pre-filled from the last interactive step. Edit if you want to assert on a different element.
              </div>
            )}
          </div>
          <div className="field">
            <label className="field__label">Assertion</label>
            <select
              className="field__input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {active.needsExpected && (
            <div className="field">
              <label className="field__label">Expected</label>
              <input
                className="field__input"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                spellCheck={false}
                placeholder={type === "value" ? "alice@example.com" : "Welcome back"}
              />
            </div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={busy || !selector.trim() || (active.needsExpected && !expected.length)}>
            <Save size={16} /> {busy ? "Saving…" : "Save assertion"}
          </button>
        </div>
      </div>
    </div>
  );
}
