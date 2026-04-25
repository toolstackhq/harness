import React from "react";

const TYPES = [
  {
    id: "script",
    label: "Record · Script",
    desc: "Emit Playwright / Cypress / Selenium / Custom code. Captures logic; one screenshot per page visit.",
    badge: "CODE"
  },
  {
    id: "doc",
    label: "Record · Doc",
    desc: "Annotated screenshot per click plus a PDF walkthrough. Captures visuals; for onboarding docs and user guides.",
    badge: "PDF"
  },
  {
    id: "inspect",
    label: "Inspect",
    desc: "Test selectors against a live page. CSS or shadow-pierce syntax. No recording, no script — just a live highlight.",
    badge: "INS"
  }
];

export default function RecordTypeSelector({ value, onChange }) {
  return (
    <div className="radios">
      {TYPES.map((t) => {
        const selected = value === t.id;
        return (
          <div
            key={t.id}
            className={`radio${selected ? " radio--selected" : ""}`}
            onClick={() => onChange(t.id)}
          >
            <div className="radio__dot" />
            <div className="radio__text">
              <div className="radio__label">{t.label}</div>
              <div className="radio__desc">{t.desc}</div>
            </div>
            <div className="radio__badge">{t.badge}</div>
          </div>
        );
      })}
    </div>
  );
}
