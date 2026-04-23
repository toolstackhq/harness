import React, { useEffect, useState } from "react";
import { Back, Forward, Reload, Note } from "./Icons.jsx";

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
  onNewSession,
  onAddNote,
  canAddNote
}) {
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
    if (!recording) return;
    let target = value.trim();
    if (!target) return;
    if (!/^(https?:|about:|file:)/i.test(target)) target = `https://${target}`;
    onNavigate(target);
  };

  return (
    <div className="browser-toolbar">
      <button className="btn btn--icon" onClick={onBack} title="Back" disabled={!recording}><Back /></button>
      <button className="btn btn--icon" onClick={onForward} title="Forward" disabled={!recording}><Forward /></button>
      <button className="btn btn--icon" onClick={onReload} title="Reload" disabled={!recording}><Reload /></button>
      <form onSubmit={submit} style={{ flex: 1, display: "flex" }}>
        <input
          className="url-bar"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          placeholder="Enter URL"
          disabled={!recording}
        />
      </form>
      {canAddNote && (
        <button
          className="btn btn--secondary"
          style={{ height: 32, padding: "0 10px", fontSize: 12 }}
          onClick={onAddNote}
          title="Add a note to the recording (Ctrl+Shift+N)"
        >
          <Note size={14} /> Add note
        </button>
      )}
      {recording ? (
        <div className="rec-chip">
          <span className="rec-chip__dot" />
          REC · {formatElapsed(elapsed)}
        </div>
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
