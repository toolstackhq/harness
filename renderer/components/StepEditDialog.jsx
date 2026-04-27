import React, { useEffect, useRef, useState } from "react";
import { Close, Save } from "./Icons.jsx";

const EDITABLE_VALUE_KINDS = new Set(["fill", "select", "press"]);

const TEMPLATE_TOKENS = [
  { token: "{{random.number}}", label: "Random number", desc: "7-digit random integer. Use {{random.number:N}} for any width up to 20.", sample: "4827193" },
  { token: "{{random.alpha:8}}", label: "Random letters", desc: "Random lowercase letters. Default 8 chars, override with :N (max 40).", sample: "qjflxzpr" },
  { token: "{{random.uuid}}", label: "UUID", desc: "Random UUID v4 — guaranteed unique per replay.", sample: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6" },
  { token: "{{random.email}}", label: "Random email", desc: "Unique user_<ts>_<rand>@example.com address.", sample: "user_1714045932_8412@example.com" },
  { token: "{{timestamp}}", label: "Timestamp", desc: "Milliseconds since epoch (Date.now()) at replay time.", sample: "1714045932148" },
  { token: "{{date.iso}}", label: "ISO date", desc: "Current ISO 8601 timestamp at replay time.", sample: "2026-04-27T09:32:12.148Z" }
];

export default function StepEditDialog({ step, onSave, onClose }) {
  const loc = step.locator || {};
  const initialSelector = loc.css || loc.xpath || "";
  const [selector, setSelector] = useState(initialSelector);
  const [value, setValue] = useState(step.value ?? "");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customTokens, setCustomTokens] = useState([]);
  const ref = useRef(null);
  const valueRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await window.harness.settings.get();
        if (!mounted) return;
        setCustomTokens(Array.isArray(s?.customTokens) ? s.customTokens : []);
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, []);

  const insertToken = (token) => {
    const el = valueRef.current;
    setPickerOpen(false);
    if (!el) { setValue((v) => (v || "") + token); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      try { el.focus(); el.setSelectionRange(start + token.length, start + token.length); } catch (_) {}
    });
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

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
                <div ref={pickerRef} style={{ position: "relative", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                    onClick={() => setPickerOpen((v) => !v)}
                  >
                    Insert dynamic value {pickerOpen ? "▴" : "▾"}
                  </button>
                  <span style={{ marginLeft: 8, fontSize: 12, color: "var(--grey-600)" }}>
                    Replaced with a fresh value on every replay.
                  </span>
                  {pickerOpen && (
                    <div className="token-picker" role="listbox">
                      {customTokens.length > 0 && (
                        <>
                          <div className="token-picker__header">Your custom tokens</div>
                          {customTokens.map((t) => (
                            <button
                              type="button"
                              key={`u_${t.name}`}
                              className="token-picker__item"
                              onClick={() => insertToken(`{{${t.name}}}`)}
                            >
                              <div className="token-picker__row">
                                <span className="token-picker__label">{t.label || t.name}</span>
                                <code className="token-picker__token">{`{{${t.name}}}`}</code>
                              </div>
                              {t.desc && <div className="token-picker__desc">{t.desc}</div>}
                              <div className="token-picker__sample">JS: {String(t.js || "").slice(0, 80) || "(no js expr)"}</div>
                            </button>
                          ))}
                        </>
                      )}
                      <div className="token-picker__header">Built-in</div>
                      {TEMPLATE_TOKENS.map((t) => (
                        <button
                          type="button"
                          key={t.token}
                          className="token-picker__item"
                          onClick={() => insertToken(t.token)}
                        >
                          <div className="token-picker__row">
                            <span className="token-picker__label">{t.label}</span>
                            <code className="token-picker__token">{t.token}</code>
                          </div>
                          <div className="token-picker__desc">{t.desc}</div>
                          <div className="token-picker__sample">e.g. {t.sample}</div>
                        </button>
                      ))}
                      <div className="token-picker__footer">
                        Add your own in <code>~/.config/Harness/harness-settings.json</code> →
                        <code>{` "customTokens": [{ "name": "myAcct", "js": "...", "java": "..." }]`}</code>
                      </div>
                    </div>
                  )}
                </div>
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
