import React, { useEffect, useRef, useState } from "react";
import FrameworkSelector from "./FrameworkSelector.jsx";
import RecordTypeSelector from "./RecordTypeSelector.jsx";
import ViewportSelector from "./ViewportSelector.jsx";
import { Play, Globe, Reload } from "./Icons.jsx";

function Chip({ framework }) {
  const label = { playwright: "PW", cypress: "CY", selenium: "SE", "selenium-java": "JV", custom: "CX" }[framework] || "PW";
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

export default function StartupScreen({ onStart, onOpenSession, refreshKey = 0 }) {
  const [recordType, setRecordType] = useState("script");
  const [framework, setFramework] = useState("playwright");
  const [viewport, setViewport] = useState("desktop");
  const [url, setUrl] = useState("https://example.com");
  const [mapping, setMapping] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState("__all__");
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const leftCardRef = useRef(null);
  const [leftHeight, setLeftHeight] = useState(null);

  useEffect(() => {
    if (!leftCardRef.current || typeof ResizeObserver === "undefined") return;
    const el = leftCardRef.current;
    const ro = new ResizeObserver(() => setLeftHeight(el.offsetHeight));
    ro.observe(el);
    setLeftHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const loadSessions = async () => {
    const list = await window.harness.sessions.load();
    setSessions(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const settings = await window.harness.settings.get();
      if (!mounted) return;
      setRecordType(settings.recordType || "script");
      setFramework(settings.framework || "playwright");
      setViewport(settings.viewport || "desktop");
      setUrl(settings.lastUrl || "https://example.com");
      setMapping(JSON.stringify(settings.customMapping || {}, null, 2));
      await loadSessions();
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => { loadSessions(); /* refetch when parent signals a change */ }, [refreshKey]);

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

  const folders = (() => {
    const set = new Set();
    for (const s of sessions) if (s.folder) set.add(s.folder);
    return [...set].sort((a, b) => a.localeCompare(b));
  })();

  const onDeleteSession = async (e, s) => {
    e.stopPropagation();
    if (!window.confirm(`Delete recording "${s.name || s.url}"? This cannot be undone.`)) return;
    await window.harness.sessions.delete(s.id);
    await loadSessions();
  };

  const onMoveSession = async (e, s) => {
    e.stopPropagation();
    const existing = folders.join(", ");
    const target = window.prompt(
      `Move "${s.name || s.url}" to folder:` +
        (existing ? `\n\nExisting: ${existing}` : "") +
        `\n\n(Leave blank to remove from any folder.)`,
      s.folder || ""
    );
    if (target === null) return;
    await window.harness.sessions.setFolder(s.id, target.trim() || null);
    await loadSessions();
  };

  const onCreateFolder = async () => {
    const name = window.prompt("New folder name:");
    if (!name || !name.trim()) return;
    setActiveFolder(name.trim());
  };

  const onRowDragStart = (e, s) => {
    setDragId(s.id);
    try {
      e.dataTransfer.setData("text/plain", s.id);
      e.dataTransfer.effectAllowed = "move";
    } catch (_) {}
  };

  const onRowDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
  };

  const onChipDragOver = (e, key) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(key);
  };

  const onChipDragLeave = (key) => {
    setDropTarget((t) => (t === key ? null : t));
  };

  const onChipDrop = async (e, folderName) => {
    e.preventDefault();
    const id = dragId || (() => { try { return e.dataTransfer.getData("text/plain"); } catch (_) { return null; } })();
    setDragId(null);
    setDropTarget(null);
    if (!id) return;
    await window.harness.sessions.setFolder(id, folderName);
    await loadSessions();
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
      await window.harness.settings.set({
        recordType,
        framework,
        viewport,
        lastUrl: url,
        ...(customMapping ? { customMapping } : {})
      });
      await onStart({ recordType, framework, viewport, url });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="startup">
      <div style={{ maxWidth: 960, width: "100%", marginBottom: 16 }}>
        <div className="landing-banner">
          <div className="landing-banner__brand">
            <div className="app-bar__logo">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="white" aria-hidden="true"><circle cx="12" cy="12" r="5" /></svg>
            </div>
            <div>
              <div className="landing-banner__title">Harness</div>
              <div className="landing-banner__tag">Record. Replay. Ship scripts or docs.</div>
            </div>
          </div>
          <div className="landing-banner__body">
            Record a flow once → <strong>Playwright / Cypress / Selenium</strong> scripts
            or an <strong>annotated PDF walkthrough</strong>. Replay any saved session
            with per-step pass/fail feedback.
          </div>
          <div className="landing-banner__chips">
            <span className="chip chip--blue">SCRIPT</span>
            <span className="chip chip--teal">DOC</span>
            <span className="chip chip--green">REPLAY</span>
          </div>
        </div>
      </div>
      <div className="startup__grid">
        <div>
          <div className="card" ref={leftCardRef}>
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
              <div className="field">
                <label className="field__label">Viewport</label>
                <ViewportSelector value={viewport} onChange={setViewport} />
              </div>
              {recordType === "script" && (
                <div className="field">
                  <label className="field__label">Framework</label>
                  <FrameworkSelector value={framework} onChange={setFramework} />
                </div>
              )}
              {recordType === "inspect" && (
                <div className="field">
                  <div className="field__help" style={{ background: "var(--blue-light)", color: "var(--blue-dark)", padding: "10px 12px", borderRadius: 4, lineHeight: 1.5 }}>
                    Inspect mode opens the URL in an embedded browser with a permanent selector inspector. Nothing is recorded; closing the session leaves no history entry.
                  </div>
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
                {recordType === "inspect" ? "Start Inspecting" : "Start Recording"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: 0 }}>
          <div
            className="card recent-card"
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              maxHeight: leftHeight ? `${leftHeight}px` : undefined
            }}
          >
            <div className="card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="card__title">Recent sessions</div>
                <div className="card__subtitle">Click a session to view steps, replay, or copy the generated script.</div>
              </div>
              <button
                className="btn btn--icon"
                onClick={loadSessions}
                title="Refresh list"
                style={{ marginTop: -4 }}
              >
                <Reload size={18} />
              </button>
            </div>
            <div className="card__body" style={{ padding: 8, display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
              {sessions.length > 0 && (
                <div style={{ padding: "4px 4px 8px" }}>
                  <input
                    className="field__input"
                    placeholder="Search by name or URL…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
              )}
              <div className="folder-bar" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 4px 8px" }}>
                <button
                  className={`folder-chip${activeFolder === "__all__" ? " folder-chip--active" : ""}`}
                  onClick={() => setActiveFolder("__all__")}
                >All</button>
                {folders.map((f) => (
                  <button
                    key={f}
                    className={`folder-chip${activeFolder === f ? " folder-chip--active" : ""}${dropTarget === f ? " folder-chip--drop" : ""}`}
                    onClick={() => setActiveFolder(f)}
                    onDragOver={(e) => onChipDragOver(e, f)}
                    onDragLeave={() => onChipDragLeave(f)}
                    onDrop={(e) => onChipDrop(e, f)}
                    title={`Filter: ${f} · Drop a recording here to move it`}
                  >📁 {f}</button>
                ))}
                <button
                  className={`folder-chip${activeFolder === "__unfiled__" ? " folder-chip--active" : ""}${dropTarget === "__unfiled__" ? " folder-chip--drop" : ""}`}
                  onClick={() => setActiveFolder("__unfiled__")}
                  onDragOver={(e) => onChipDragOver(e, "__unfiled__")}
                  onDragLeave={() => onChipDragLeave("__unfiled__")}
                  onDrop={(e) => onChipDrop(e, null)}
                >Unfiled</button>
                <button className="folder-chip folder-chip--ghost" onClick={onCreateFolder} title="Create a folder; assign sessions via Move or drag-drop.">+ New folder</button>
              </div>
              {sessions.length === 0 ? (
                <div className="recent-item__empty">No saved sessions yet.</div>
              ) : (
                (() => {
                  const q = query.trim().toLowerCase();
                  let filtered = q
                    ? sessions.filter((s) => (s.name || "").toLowerCase().includes(q) || (s.url || "").toLowerCase().includes(q))
                    : sessions;
                  if (activeFolder === "__unfiled__") filtered = filtered.filter((s) => !s.folder);
                  else if (activeFolder !== "__all__") filtered = filtered.filter((s) => s.folder === activeFolder);
                  if (!filtered.length) {
                    const label = activeFolder === "__all__" ? `"${query}"` : activeFolder === "__unfiled__" ? "Unfiled" : `"${activeFolder}"`;
                    return <div className="recent-item__empty">No sessions in {label}.</div>;
                  }
                  return <div className="sessions-scroll" style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }}>
                    <div className="sessions-list">
                    {filtered.map((s) => (
                      <div
                        className={`session-row${dragId === s.id ? " session-row--dragging" : ""}`}
                        key={s.id}
                        draggable
                        onDragStart={(e) => onRowDragStart(e, s)}
                        onDragEnd={onRowDragEnd}
                        onClick={() => onOpenSession?.(s)}
                      >
                        <div className="session-row__icon"><Globe size={18} /></div>
                        <div className="session-row__body">
                          <div className="session-row__url">{s.name || s.url}</div>
                          <div className="session-row__meta">
                            {s.name && <><span className="session-row__url-mini">{s.url}</span> · </>}
                            {formatAt(s.timestamp)}
                            {s.folder && <> · <span style={{ color: "var(--teal)", fontWeight: 500 }}>📁 {s.folder}</span></>}
                            {s.generatedScript && <> · <span style={{ color: "var(--blue)", fontWeight: 500 }}>script saved</span></>}
                          </div>
                        </div>
                        <div className="session-row__steps">{s.stepCount} {s.stepCount === 1 ? "step" : "steps"}</div>
                        <Chip framework={s.framework} />
                        <div className="session-row__actions">
                          <button className="row-action" title="Move to folder" onClick={(e) => onMoveSession(e, s)}>📁</button>
                          <button className="row-action row-action--danger" title="Delete recording" onClick={(e) => onDeleteSession(e, s)}>✕</button>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>;
                })()
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
