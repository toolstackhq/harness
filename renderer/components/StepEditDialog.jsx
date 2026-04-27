import React, { useEffect, useRef, useState } from "react";
import { Close, Save } from "./Icons.jsx";

const EDITABLE_VALUE_KINDS = new Set(["fill", "select", "press"]);

const TEMPLATE_TOKENS = [
  { token: "{{random.number}}", label: "Random number", desc: "7-digit random integer (use {{random.number:N}} for N digits)" },
  { token: "{{random.alpha:8}}", label: "Random letters", desc: "Random lowercase letters (default 8, override with :N)" },
  { token: "{{random.uuid}}", label: "UUID", desc: "Random UUID v4" },
  { token: "{{random.email}}", label: "Random email", desc: "user_<ts>_<rand>@example.com" },
  { token: "{{timestamp}}", label: "Timestamp", desc: "Date.now() at replay" },
  { token: "{{date.iso}}", label: "ISO date", desc: "Current ISO timestamp at replay" }
];

export default function StepEditDialog({ step, onSave, onClose }) {
  const loc = step.locator || {};
  const initialSelector = loc.css || loc.xpath || "";
  const [selector, setSelector] = useState(initialSelector);
  const [value, setValue] = useState(step.value ?? "");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const valueRef = useRef(null);

  const insertToken = (token) => {
    const el = valueRef.current;
    if (!el) { setValue((v) => (v || "") + token); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      try { el.focus(); el.setSelectionRange(start + token.length, start + token.length); } catch (_) {}
    });
  };

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
                ref={valueRef}
                className="field__input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
              />
              {step.kind === "fill" && (
                <>
                  <div className="field__help" style={{ marginTop: 6 }}>
                    Use <code>{"{{token}}"}</code> placeholders to inject dynamic values at replay time. Click a token below to insert it at the cursor.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {TEMPLATE_TOKENS.map((t) => (
                      <button
                        type="button"
                        key={t.token}
                        className="token-chip"
                        title={t.desc}
                        onClick={() => insertToken(t.token)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
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
