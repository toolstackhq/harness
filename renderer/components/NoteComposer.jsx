import React, { useEffect, useRef, useState } from "react";
import { Close, Note } from "./Icons.jsx";

export default function NoteComposer({ onSave, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const ok = await onSave?.(trimmed);
      if (ok !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title"><Note size={18} /> Add note</div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body" style={{ background: "white", padding: 16 }}>
          <textarea
            ref={ref}
            className="field__textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. This locator is auto-generated from a text match; replace with a data-testid before production."
            style={{ minHeight: 140, fontFamily: "var(--font)", fontSize: 14 }}
          />
          <div className="field__help" style={{ marginTop: 8 }}>
            Notes render as code comments in scripts and as a highlighted callout in HTML / PDF exports. Esc to cancel, Ctrl+Enter to save.
          </div>
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={busy || !text.trim()}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
