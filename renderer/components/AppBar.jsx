import React from "react";
import { Logo, Play, Code } from "./Icons.jsx";

export default function AppBar({ section, primary }) {
  return (
    <div className="app-bar">
      <div className="app-bar__logo"><Logo size={16} /></div>
      <div className="app-bar__title">
        Recrd
        {section && <span className="app-bar__section">{section}</span>}
      </div>
      <div className="app-bar__spacer" />
      {primary && (
        <button className="btn btn--primary" onClick={primary.onClick} disabled={primary.disabled}>
          {primary.icon === "play" && <Play size={18} />}
          {primary.icon === "code" && <Code size={18} />}
          {primary.label}
        </button>
      )}
      <div className="app-bar__avatar">S</div>
    </div>
  );
}
