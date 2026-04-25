import React, { useEffect, useMemo, useState } from "react";
import { Close, Save, actionIcon } from "./Icons.jsx";
import { encodeWalkthroughVideo } from "../lib/encodeWalkthroughVideo.js";
import { encodeWalkthroughMp4 } from "../lib/encodeWalkthroughMp4.js";
import { isMp4Supported } from "../lib/renderWalkthroughFrames.js";

function describe(step) {
  const loc = step.locator || {};
  const label = loc.label || loc.name || loc.text || loc.css || step.element?.tag || step.kind;
  if (step.kind === "note") return { action: "Note", target: (step.text || "").split("\n")[0] };
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

  const [progress, setProgress] = useState(null); // { i, total } | null
  const [mp4Available, setMp4Available] = useState(false);

  useEffect(() => { isMp4Supported().then(setMp4Available); }, []);

  const doExport = async () => {
    setBusy(true);
    setProgress(null);
    try {
      const indices = [...selected].sort((a, b) => a - b);
      if (format === "webm" || format === "mp4") {
        const filteredSteps = indices.map((i) => steps[i]).filter(Boolean);
        const encoder = format === "mp4" ? encodeWalkthroughMp4 : encodeWalkthroughVideo;
        const bytes = await encoder(filteredSteps, {
          fps: 4,
          holdMs: 2000,
          onProgress: (i, total) => setProgress({ i, total })
        });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const result = await window.harness.journey.saveVideo({
          bytes,
          defaultName: `walkthrough-${stamp}.${format}`
        });
        if (result?.ok) onClose?.();
        else if (result?.error) alert(result.error);
        return;
      }
      const result = await window.harness.journey.export({ indices, format, callouts });
      if (result?.ok) onClose?.();
      else if (result && result.error) alert(result.error);
    } catch (err) {
      alert(`Export failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
      setProgress(null);
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
            <button
              className={`seg__btn${format === "md" ? " seg__btn--active" : ""}`}
              onClick={() => setFormat("md")}
              title="Single .md file with screenshots embedded as base64"
            >MD</button>
            <button
              className={`seg__btn${format === "webm" ? " seg__btn--active" : ""}`}
              onClick={() => setFormat("webm")}
              title="Stitched video — encoded via MediaRecorder, plays in browsers / VLC."
            >WebM</button>
            <button
              className={`seg__btn${format === "mp4" ? " seg__btn--active" : ""}`}
              onClick={() => mp4Available && setFormat("mp4")}
              disabled={!mp4Available}
              title={mp4Available
                ? "Stitched video as MP4 (H.264) — broader compatibility (PowerPoint, Outlook, Confluence)."
                : "MP4 encoding (H.264) not supported on this system. Use WebM instead."}
            >MP4</button>
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
            <Save size={16} />
            {busy
              ? (progress
                  ? `Encoding ${progress.i}/${progress.total}…`
                  : "Exporting…")
              : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
