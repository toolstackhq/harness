import React, { useEffect, useMemo, useState } from "react";
import { Close, Save, actionIcon } from "./Icons.jsx";

function describe(step) {
  const loc = step.locator || {};
  const label = loc.label || loc.name || loc.text || loc.css || step.element?.tag || step.kind;
  if (step.kind === "navigate") return { action: "Navigate", target: step.url || "" };
  if (step.kind === "fill") return { action: "Fill", target: `${label} = ${JSON.stringify(step.value ?? "")}` };
  if (step.kind === "check") return { action: step.checked ? "Check" : "Uncheck", target: label };
  if (step.kind === "select") return { action: "Select", target: `${label} = ${JSON.stringify(step.value ?? "")}` };
  if (step.kind === "press") return { action: `Press ${step.key || "Enter"}`, target: label };
  if (step.kind === "submit") return { action: "Submit", target: label };
  if (step.kind === "click") return { action: "Click", target: label };
  return { action: step.kind, target: label };
}

export default function JourneyExportDialog({ steps, onClose, defaultFormat = "html" }) {
  const [selected, setSelected] = useState(() => new Set(steps.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState(defaultFormat);
  const [callouts, setCallouts] = useState(true);

  useEffect(() => {
    setSelected(new Set(steps.map((_, i) => i)));
  }, [steps]);

  const shotCount = useMemo(
    () => steps.filter((s, i) => selected.has(i) && s.screenshot).length,
    [steps, selected]
  );

  const toggle = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };
  const allOn = () => setSelected(new Set(steps.map((_, i) => i)));
  const allOff = () => setSelected(new Set());

  const doExport = async () => {
    setBusy(true);
    try {
      const indices = [...selected].sort((a, b) => a - b);
      const result = await window.recrd.journey.export({ indices, format, callouts });
      if (result?.ok) onClose?.();
      else if (result && result.error) alert(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div>
            <div className="dialog__title">Export user journey</div>
            <div className="dialog__meta">
              <span>{selected.size} of {steps.length} steps selected</span>
              <span>· {shotCount} screenshot{shotCount === 1 ? "" : "s"}</span>
            </div>
          </div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="journey-toolbar">
          <button className="btn btn--secondary" onClick={allOn}>Select all</button>
          <button className="btn btn--secondary" onClick={allOff}>Select none</button>
          <div className="journey-toolbar__spacer" />
          <label className="journey-opt">
            <input type="checkbox" checked={callouts} onChange={(e) => setCallouts(e.target.checked)} />
            Numbered callouts
          </label>
          <div className="seg">
            <button
              className={`seg__btn${format === "html" ? " seg__btn--active" : ""}`}
              onClick={() => setFormat("html")}
            >HTML</button>
            <button
              className={`seg__btn${format === "pdf" ? " seg__btn--active" : ""}`}
              onClick={() => setFormat("pdf")}
            >PDF</button>
          </div>
        </div>
        <div className="dialog__body journey-body">
          {steps.length === 0 ? (
            <div className="empty-tab">No steps to export.</div>
          ) : (
            steps.map((step, i) => {
              const Icon = actionIcon(step.kind);
              const { action, target } = describe(step);
              const checked = selected.has(i);
              const loc = step.locator || {};
              const hasShadow = Array.isArray(loc.shadowChain) && loc.shadowChain.length > 0;
              return (
                <label key={i} className={`journey-row${checked ? "" : " journey-row--off"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(i)} />
                  <div className="journey-row__num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="journey-row__icon"><Icon size={14} /></div>
                  <div className="journey-row__body">
                    <div className="journey-row__action">
                      {action}
                      {step.screenshot && <span className="journey-row__shot-chip">screenshot</span>}
                    </div>
                    <div className="journey-row__target">
                      {hasShadow && <span style={{ color: "var(--teal)" }}>{loc.shadowChain.join(" » ")} » </span>}
                      {target}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="dialog__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={doExport} disabled={busy || selected.size === 0}>
            <Save size={16} /> {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
