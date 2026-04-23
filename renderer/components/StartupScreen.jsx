import React, { useEffect, useState } from "react";
import FrameworkSelector from "./FrameworkSelector.jsx";
import RecordTypeSelector from "./RecordTypeSelector.jsx";
import { Play, Globe } from "./Icons.jsx";

function Chip({ framework }) {
  const label = { playwright: "PW", cypress: "CY", selenium: "SE", custom: "CX" }[framework] || "PW";
  return <span className={`framework-chip framework-chip--${framework}`}>{label}</span>;
}

function formatAt(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function StartupScreen({ onStart, onOpenSession }) {
  const [recordType, setRecordType] = useState("script");
  const [framework, setFramework] = useState("playwright");
  const [url, setUrl] = useState("https://example.com");
  const [mapping, setMapping] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    const list = await window.recrd.sessions.load();
    setSessions(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const settings = await window.recrd.settings.get();
      if (!mounted) return;
      setRecordType(settings.recordType || "script");
      setFramework(settings.framework || "playwright");
      setUrl(settings.lastUrl || "https://example.com");
      setMapping(JSON.stringify(settings.customMapping || {}, null, 2));
      await loadSessions();
    })();
    return () => { mounted = false; };
  }, []);

  const validateMapping = () => {
    if (framework !== "custom") return null;
    try {
      const parsed = JSON.parse(mapping);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Mapping must be a JSON object");
      setMappingError("");
      return parsed;
    } catch (err) {
      setMappingError(String(err.message || err));
      return false;
    }
  };

  const onStartClick = async () => {
    let customMapping = undefined;
    if (recordType === "script" && framework === "custom") {
      const parsed = validateMapping();
      if (parsed === false) return;
      customMapping = parsed;
    }
    setLoading(true);
    try {
      await window.recrd.settings.set({
        recordType,
        framework,
        lastUrl: url,
        ...(customMapping ? { customMapping } : {})
      });
      await onStart({ recordType, framework, url });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="startup">
      <div className="startup__grid">
        <div>
          <div className="card">
            <div className="card__header">
              <div className="card__title">Session configuration</div>
              <div className="card__subtitle">Choose a framework and a target URL for this recording session.</div>
            </div>
            <div className="card__body">
              <div className="field">
                <label className="field__label">Starting URL</label>
                <input
                  className="field__input field__input--mono"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label className="field__label">Recording type</label>
                <RecordTypeSelector value={recordType} onChange={setRecordType} />
              </div>
              {recordType === "script" && (
                <div className="field">
                  <label className="field__label">Framework</label>
                  <FrameworkSelector value={framework} onChange={setFramework} />
                </div>
              )}
              {recordType === "script" && framework === "custom" && (
                <div className="field">
                  <label className="field__label">Custom action mapping (JSON)</label>
                  <textarea
                    className="field__textarea"
                    value={mapping}
                    onChange={(e) => setMapping(e.target.value)}
                    spellCheck={false}
                    placeholder={'{\n  "click": "this.clickElement(\'{selector}\')",\n  "type": "this.typeInto(\'{selector}\', \'{value}\')"\n}'}
                  />
                  <div className="field__help">Available placeholders: {"{selector}"}, {"{value}"}, {"{url}"}, {"{key}"}, {"{checked}"}, {"{label}"}, {"{role}"}, {"{text}"}.</div>
                  {mappingError && <div className="field__error">{mappingError}</div>}
                </div>
              )}
            </div>
            <div className="card__action">
              <button className="btn btn--primary" onClick={onStartClick} disabled={loading || !url}>
                <Play size={18} />
                Start Recording
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="card">
            <div className="card__header">
              <div className="card__title">Recent sessions</div>
              <div className="card__subtitle">Click a session to view steps, replay, or copy the generated script.</div>
            </div>
            <div className="card__body" style={{ padding: 8 }}>
              {sessions.length === 0 ? (
                <div className="recent-item__empty">No saved sessions yet.</div>
              ) : (
                <div className="sessions-list">
                  {sessions.map((s) => (
                    <div className="session-row" key={s.id} onClick={() => onOpenSession?.(s)}>
                      <div className="session-row__icon"><Globe size={18} /></div>
                      <div className="session-row__body">
                        <div className="session-row__url">{s.url}</div>
                        <div className="session-row__meta">
                          {formatAt(s.timestamp)}
                          {s.generatedScript && <> · <span style={{ color: "var(--blue)", fontWeight: 500 }}>script saved</span></>}
                        </div>
                      </div>
                      <div className="session-row__steps">{s.stepCount} {s.stepCount === 1 ? "step" : "steps"}</div>
                      <Chip framework={s.framework} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <div className="card__title">Capabilities</div>
              <div className="card__subtitle">What this session will capture.</div>
            </div>
            <div className="card__body">
              <ul className="capabilities">
                <li>Clicks, fills, selects, checkbox/radio toggles</li>
                <li>Enter key presses and form submits</li>
                <li>SPA navigations via history API</li>
                <li>Shadow DOM pierce chain selectors</li>
                <li>Stable locators (data-testid → aria → id → CSS)</li>
                <li>CDP replay of recorded steps</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
