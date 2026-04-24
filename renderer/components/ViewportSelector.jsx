import React from "react";

const OPTIONS = [
  { id: "desktop", label: "Desktop", size: "1440 × 900" },
  { id: "tablet",  label: "Tablet",  size: "768 × 1024" },
  { id: "mobile",  label: "Mobile",  size: "390 × 844" }
];

export default function ViewportSelector({ value, onChange }) {
  return (
    <div className="seg" role="group">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`seg__btn${value === o.id ? " seg__btn--active" : ""}`}
          onClick={() => onChange(o.id)}
          title={o.size}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
