import React from "react";

export default function InfoBar({ cdp, framework, steps, shadows, warnings }) {
  return (
    <div className="info-bar">
      <div className="info-bar__item">
        <span className={`info-bar__dot${cdp ? " info-bar__dot--ok" : ""}`} />
        <span className="info-bar__label">CDP</span>
        <span className="info-bar__value">{cdp ? "attached" : "idle"}</span>
      </div>
      <div className="info-bar__item">
        <span className="info-bar__dot info-bar__dot--blue" />
        <span className="info-bar__label">Framework</span>
        <span className="info-bar__value">{framework}</span>
      </div>
      <div className="info-bar__item">
        <span className="info-bar__dot info-bar__dot--blue" />
        <span className="info-bar__label">Steps</span>
        <span className="info-bar__value">{steps}</span>
      </div>
      <div className="info-bar__item">
        <span className="info-bar__dot info-bar__dot--teal" />
        <span className="info-bar__label">Shadow</span>
        <span className="info-bar__value">{shadows}</span>
      </div>
      <div className="info-bar__item">
        {warnings > 0 ? (
          <span className="info-bar__warn">{warnings} warning{warnings === 1 ? "" : "s"}</span>
        ) : (
          <>
            <span className="info-bar__dot info-bar__dot--ok" />
            <span className="info-bar__label">Warnings</span>
            <span className="info-bar__value">0</span>
          </>
        )}
      </div>
    </div>
  );
}
