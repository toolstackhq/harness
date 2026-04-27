import React from "react";
import { Close, Copy, Save } from "./Icons.jsx";

const CHIP = { playwright: "PW", cypress: "CY", selenium: "SE", "selenium-java": "JV", custom: "CX" };

export default function ScriptDialog({ code, framework, onClose, onCopy, onSave }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title">
            Generated script
            <span className={`framework-chip framework-chip--${framework}`}>{CHIP[framework] || "PW"}</span>
          </div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body">
          <pre className="dialog__code">{code}</pre>
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onCopy}><Copy size={16} /> Copy</button>
          <button className="btn btn--primary" onClick={onSave}><Save size={16} /> Save to file</button>
        </div>
      </div>
    </div>
  );
}
