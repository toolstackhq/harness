import React from "react";
import { Close } from "./Icons.jsx";

const SHORTCUTS = [
  ["Ctrl + Shift + N", "Add note"],
  ["Ctrl + Shift + A", "Add assertion (Script Gen only)"],
  ["Ctrl + Shift + S", "Capture area"],
  ["Ctrl + Shift + W", "Add wait"],
  ["Ctrl + Shift + P", "Pause / resume capture"]
];

export default function AboutDialog({ onClose }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div className="dialog__title">About Harness</div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="dialog__body" style={{ background: "white", padding: 20 }}>
          <p style={{ margin: "0 0 12px", color: "var(--grey-800)", lineHeight: 1.5 }}>
            Harness records browser interactions in an embedded Chromium
            session and turns them into either test scripts (Playwright,
            Cypress, Selenium, or a custom template) or annotated
            walkthroughs (HTML / PDF with per-click screenshots).
          </p>
          <p style={{ margin: "0 0 16px", color: "var(--grey-800)", lineHeight: 1.5 }}>
            Every saved session can be replayed against the same browser
            with visible per-step pass/fail feedback.
          </p>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--grey-700)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Keyboard shortcuts
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <tbody>
              {SHORTCUTS.map(([k, label]) => (
                <tr key={k}>
                  <td style={{ padding: "6px 8px", color: "var(--grey-900)" }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: 12, background: "var(--grey-100)", padding: "2px 8px", borderRadius: 3 }}>{k}</code>
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--grey-700)" }}>{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dialog__footer">
          <a href="https://github.com/toolstackhq/harness" target="_blank" rel="noreferrer" style={{ fontSize: 13, marginRight: "auto" }}>toolstackhq/harness</a>
          <button className="btn btn--primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
