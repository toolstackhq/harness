import React, { useEffect, useState } from "react";
import { Back, Forward, Reload, Note, Assert, Camera, Pause, Play, Clock } from "./Icons.jsx";

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function BrowserToolbar({
  url,
  onNavigate,
  onBack,
  onForward,
  onReload,
  startedAt,
  recording,
  replaying,
  onNewSession,
  onAddNote,
  canAddNote,
  onAddAssertion,
  canAddAssertion,
  onCaptureArea,
  canCapture,
  paused,
  onTogglePause,
  onAddWait
}) {
  const canNavigate = !replaying;
  const [value, setValue] = useState(url || "");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { setValue(url || ""); }, [url]);
  useEffect(() => {
    if (!startedAt || !recording) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, recording]);

  const submit = (e) => {
    e.preventDefault();
    if (!canNavigate) return;
    let target = value.trim();
    if (!target) return;
    if (!/^(https?:|about:|file:)/i.test(target)) target = `https://${target}`;
    onNavigate(target);
  };

  return (
    <div className="browser-toolbar">
      <button className="btn btn--icon" onClick={onBack} title="Back" disabled={!canNavigate}><Back /></button>
      <button className="btn btn--icon" onClick={onForward} title="Forward" disabled={!canNavigate}><Forward /></button>
      <button className="btn btn--icon" onClick={onReload} title="Reload" disabled={!canNavigate}><Reload /></button>
      <form onSubmit={submit} style={{ flex: 1, display: "flex" }}>
        <input
          className="url-bar"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          placeholder="Enter URL"
          disabled={!canNavigate}
          title={!canNavigate ? "Disabled during replay" : ""}
        />
      </form>
      {canAddNote && (
        <button
          className="btn btn--secondary"
          style={{ height: 32, padding: "0 10px", fontSize: 12 }}
          onClick={onAddNote}
          title="Add a note (Ctrl+Shift+N)"
        >
          <Note size={14} /> Add note
        </button>
      )}
      {canAddAssertion && (
        <button
          className="btn btn--secondary"
          style={{ height: 32, padding: "0 10px", fontSize: 12 }}
          onClick={onAddAssertion}
          title="Add an assertion (Ctrl+Shift+A)"
        >
          <Assert size={14} /> Add assertion
        </button>
      )}
      {canCapture && (
        <button
          className="btn btn--secondary"
          style={{ height: 32, padding: "0 10px", fontSize: 12 }}
          onClick={onCaptureArea}
          title="Capture an area and annotate (Ctrl+Shift+S)"
        >
          <Camera size={14} /> Capture area
        </button>
      )}
      {recording && onAddWait && (
        <button
          className="btn btn--secondary"
          style={{ height: 32, padding: "0 10px", fontSize: 12 }}
          onClick={onAddWait}
          title="Add a wait step (Ctrl+Shift+W)"
        >
          <Clock size={14} /> Wait
        </button>
      )}
      {recording && onTogglePause && (
        <button
          className="btn btn--secondary"
          style={{ height: 32, padding: "0 10px", fontSize: 12 }}
          onClick={onTogglePause}
          title={paused ? "Resume capture (Ctrl+Shift+P)" : "Pause capture (Ctrl+Shift+P)"}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? "Resume" : "Pause"}
        </button>
      )}
      {recording ? (
        paused ? (
          <div className="stopped-chip" style={{ background: "var(--orange-bg)", color: "var(--orange)", borderColor: "var(--orange)" }}>
            <span className="stopped-chip__dot" style={{ background: "var(--orange)" }} />
            PAUSED · {formatElapsed(elapsed)}
          </div>
        ) : (
          <div className="rec-chip">
            <span className="rec-chip__dot" />
            REC · {formatElapsed(elapsed)}
          </div>
        )
      ) : (
        <div className="stopped-chip">
          <span className="stopped-chip__dot" />
          Stopped
        </div>
      )}
      {!recording && (
        <button className="new-session-btn" onClick={onNewSession}>← New Session</button>
      )}
    </div>
  );
}
