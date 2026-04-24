import React from "react";
import { Logo, Play, Code, Save } from "./Icons.jsx";

function ActionButton({ action, variant }) {
  if (!action) return null;
  const cls = variant === "secondary" ? "btn btn--secondary" : "btn btn--primary";
  return (
    <button className={cls} onClick={action.onClick} disabled={action.disabled} title={action.title || action.label}>
      {action.icon === "play" && <Play size={18} />}
      {action.icon === "code" && <Code size={18} />}
      {action.icon === "save" && <Save size={16} />}
      {action.label}
    </button>
  );
}

export default function AppBar({ section, primary, secondary }) {
  return (
    <div className="app-bar">
      <div className="app-bar__logo"><Logo size={16} /></div>
      <div className="app-bar__title">
        Harness
        {section && <span className="app-bar__section">{section}</span>}
      </div>
      <div className="app-bar__spacer" />
      <ActionButton action={secondary} variant="secondary" />
      <ActionButton action={primary} variant="primary" />
      <div className="app-bar__avatar">S</div>
    </div>
  );
}
