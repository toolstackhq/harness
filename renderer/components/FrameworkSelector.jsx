import React from "react";

const FRAMEWORKS = [
  { id: "playwright", label: "Playwright", desc: "Modern cross-browser testing — role-based locators, pierce syntax for shadow DOM.", badge: "PW" },
  { id: "cypress", label: "Cypress", desc: "Runs in-browser, cy.get/cy.contains with .shadow() for shadow DOM.", badge: "CY" },
  { id: "selenium", label: "Selenium", desc: "WebDriver protocol, By.css/By.xpath with JS executor for shadow DOM.", badge: "SE" },
  { id: "custom", label: "Custom", desc: "Define your own template mapping per action.", badge: "CX" }
];

export default function FrameworkSelector({ value, onChange }) {
  return (
    <div className="radios">
      {FRAMEWORKS.map((f) => {
        const selected = value === f.id;
        return (
          <div
            key={f.id}
            className={`radio${selected ? " radio--selected" : ""}`}
            onClick={() => onChange(f.id)}
          >
            <div className="radio__dot" />
            <div className="radio__text">
              <div className="radio__label">{f.label}</div>
              <div className="radio__desc">{f.desc}</div>
            </div>
            <div className="radio__badge">{f.badge}</div>
          </div>
        );
      })}
    </div>
  );
}
