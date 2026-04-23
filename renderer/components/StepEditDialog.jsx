import React, { useEffect, useRef, useState } from "react";
import { Close, Save } from "./Icons.jsx";

const EDITABLE_VALUE_KINDS = new Set(["fill", "select", "press"]);

export default function StepEditDialog({ step, onSave, onClose }) {
  const loc = step.locator || {};
  const initialSelector = loc.css || loc.xpath || "";
  const [selector, setSelector] = useState(initialSelector);
  const [value, setValue] = useState(step.value ?? "");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const patch = {};
      if (selector !== initialSelector) patch.selector = selector;
      if (EDITABLE_VALUE_KINDS.has(step.kind) && value !== step.value) patch.value = value;
      const ok = await onSave?.(patch);
      if (ok !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title">Edit step #{String(step.number || "").padStart(2, "0")} — {step.kind}</div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body" style={{ background: "white", padding: 16 }}>
          {step.kind !== "navigate" && (
            <div className="field">
              <label className="field__label">Selector</label>
              <input
                ref={ref}
                className="field__input field__input--mono"
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                spellCheck={false}
              />
              <div className="field__help">Overriding clears any shadow-DOM chain — this is treated as a flat selector.</div>
            </div>
          )}
          {EDITABLE_VALUE_KINDS.has(step.kind) && (
            <div className="field">
              <label className="field__label">
                {step.kind === "press" ? "Key" : step.kind === "select" ? "Option value" : "Fill value"}
              </label>
              <input
                className="field__input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
          {step.kind === "navigate" && (
            <div className="field__help">Navigation steps are not editable beyond reorder / delete (use Delete if you need to remove one).</div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={busy || step.kind === "navigate"}>
            <Save size={16} /> {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
