import React, { useEffect, useRef, useState } from "react";
import { Close, Save } from "./Icons.jsx";

export default function WaitDialog({ title = "Add wait", initialMs = 1000, onSave, onClose }) {
  const [ms, setMs] = useState(initialMs);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Enter") save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);

  const save = async () => {
    const n = Math.max(0, Number(ms) || 0);
    if (!n || busy) return;
    setBusy(true);
    try {
      const ok = await onSave?.(n);
      if (ok !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title">{title}</div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body" style={{ background: "white", padding: 16 }}>
          <div className="field">
            <label className="field__label">Duration (milliseconds)</label>
            <input
              ref={ref}
              className="field__input field__input--mono"
              type="number"
              min={0}
              step={100}
              value={ms}
              onChange={(e) => setMs(e.target.value)}
            />
            <div className="field__help">Typical values: 250 ms (settle), 500–1000 ms (transitions), 2000+ ms (async loading).</div>
          </div>
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={busy || !ms}>
            <Save size={16} /> {busy ? "Saving…" : "Save wait"}
          </button>
        </div>
      </div>
    </div>
  );
}
