import React, { useEffect, useRef, useState } from "react";
import { Close, Copy, Save, Play, Trash, Edit, actionIcon } from "./Icons.jsx";
import LlmPromptDialog from "./LlmPromptDialog.jsx";


const CHIP = { playwright: "PW", cypress: "CY", selenium: "SE", "selenium-java": "JV", custom: "CX" };

function describe(step) {
  const loc = step.locator || {};
  const label = loc.label || loc.name || loc.text || loc.css || step.element?.tag || step.kind;
  if (step.kind === "note") return { action: "note", target: (step.text || "").split("\n")[0] };
  if (step.kind === "navigate") return { action: "navigate", target: step.url || "" };
  if (step.kind === "fill") return { action: "fill", target: `${label} = ${JSON.stringify(step.value ?? "")}` };
  if (step.kind === "check") return { action: step.checked ? "check" : "uncheck", target: label };
  if (step.kind === "select") return { action: "select", target: `${label} = ${JSON.stringify(step.value ?? "")}` };
  if (step.kind === "press") return { action: `press ${step.key || "Enter"}`, target: label };
  if (step.kind === "submit") return { action: "submit", target: label };
  return { action: step.kind, target: label };
}

function formatAt(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}

function StepRow({ step, index }) {
  const loc = step.locator || {};
  const hasShadow = Array.isArray(loc.shadowChain) && loc.shadowChain.length > 0;
  const Icon = actionIcon(step.kind);
  const { action, target } = describe(step);
  const selector = step.kind === "navigate" ? step.url : (loc.css || loc.xpath || "");
  const cls = ["step"];
  if (hasShadow) cls.push("step--shadow");
  return (
    <div className={cls.join(" ")}>
      <div className="step__num">{String(index + 1).padStart(2, "0")}</div>
      <div className="step__icon"><Icon size={14} /></div>
      <div className="step__body">
        <div className="step__action">{action}</div>
        <div className="step__selector">
          {hasShadow && <span className="step__shadow-chain">{loc.shadowChain.join(" » ")} » </span>}
          {selector}
        </div>
        {hasShadow && (
          <div className="step__badges">
            <span className="step__badge step__badge--shadow">SHADOW</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionDetailModal({ session, onClose, onDelete, onReplay, onUpdate }) {
  const [tab, setTab] = useState("steps");
  const [script, setScript] = useState(session.generatedScript || "");
  const [generating, setGenerating] = useState(false);
  const [name, setName] = useState(session.name || "");
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => { setName(session.name || ""); }, [session]);
  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);

  const commitName = async () => {
    setEditingName(false);
    const trimmed = name.trim();
    if ((trimmed || null) === (session.name || null)) return;
    const result = await window.harness.sessions.rename(session.id, trimmed);
    if (result?.ok) onUpdate?.(result.session);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await window.harness.sessions.generate(session.id);
      if (result.ok) {
        setScript(result.code);
        onUpdate?.(result.session);
      }
    } finally {
      setGenerating(false);
    }
  };

  const copyScript = () => window.harness.script.copy(script);
  const saveScript = () => window.harness.sessions.saveFile({
    script,
    filename: `session-${session.id.slice(0, 8)}.spec.js`
  });

  const del = async () => {
    await window.harness.sessions.delete(session.id);
    onDelete?.(session.id);
  };

  const replay = async () => {
    onReplay?.(session);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <input
                ref={nameRef}
                className="field__input"
                style={{ maxWidth: 520, fontWeight: 500, fontSize: 16 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === "Enter") commitName(); else if (e.key === "Escape") { setName(session.name || ""); setEditingName(false); } }}
                placeholder="e.g. Checkout flow"
                maxLength={120}
              />
            ) : (
              <div
                className="dialog__title"
                style={{ maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}
                onClick={() => setEditingName(true)}
                title="Click to rename"
              >
                {session.name || session.url}
                <Edit size={14} style={{ marginLeft: 8, opacity: 0.5, verticalAlign: "middle" }} />
              </div>
            )}
            <div className="dialog__meta">
              {session.name && <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{session.url}</span>}
              <span>{formatAt(session.timestamp)}</span>
              <span className={`framework-chip framework-chip--${session.framework}`}>{CHIP[session.framework] || "PW"}</span>
              <span>{session.stepCount} {session.stepCount === 1 ? "step" : "steps"}</span>
            </div>
          </div>
          <button className="dialog__close" onClick={onClose}><Close /></button>
        </div>
        <div className="tabs">
          <div className={`tab${tab === "steps" ? " tab--active" : ""}`} onClick={() => setTab("steps")}>Steps</div>
          <div className={`tab${tab === "script" ? " tab--active" : ""}`} onClick={() => setTab("script")}>Generated Script</div>
        </div>
        <div className="dialog__body">
          {tab === "steps" && (
            <div className="session-steps">
              {(session.steps || []).length === 0 ? (
                <div className="empty-tab">No steps recorded for this session.</div>
              ) : (
                session.steps.map((s, i) => <StepRow key={i} step={s} index={i} />)
              )}
            </div>
          )}
          {tab === "script" && (
            script ? (
              <pre className="dialog__code">{script}</pre>
            ) : (
              <div className="empty-tab">
                <div>Script not generated for this session.</div>
                <button className="btn btn--primary" onClick={generate} disabled={generating || (session.steps || []).length === 0}>
                  {generating ? "Generating…" : "Generate Now"}
                </button>
              </div>
            )
          )}
        </div>
        <div className="dialog__footer dialog__footer--spaced">
          <button className="btn btn--danger" onClick={del}><Trash size={14} /> Delete</button>
          <div className="dialog__footer-group">
            <button className="btn btn--secondary" onClick={replay} disabled={(session.steps || []).length === 0}><Play size={14} /> Replay</button>
            <ExportMenu
              sessionId={session.id}
              disabled={(session.steps || []).length === 0}
              script={script}
              onCopyScript={copyScript}
              onSaveScript={saveScript}
              onGenerate={generate}
              generating={generating}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportMenu({ sessionId, disabled, script, onCopyScript, onSaveScript, onGenerate, generating }) {
  const [open, setOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const exportSelectorsAs = async (format) => {
    setBusy(true);
    setOpen(false);
    try {
      const r = await window.harness.sessions.exportSelectors({ id: sessionId, format });
      if (r?.ok) alert(`Saved ${r.count} selectors → ${r.path}`);
      else if (r?.error) alert(r.error);
    } finally { setBusy(false); }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn--primary" disabled={disabled || busy || generating} onClick={() => setOpen((v) => !v)}>
        <Save size={14} /> Export {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="export-menu">
          <div className="export-menu__section">
            <div className="export-menu__title">Test script</div>
            <div className="export-menu__hint">Direct codegen for the framework saved with this session.</div>
            {script ? (
              <>
                <button className="export-menu__item" onClick={() => { setOpen(false); onCopyScript(); }}>
                  <Copy size={14} /> Copy generated script
                </button>
                <button className="export-menu__item" onClick={() => { setOpen(false); onSaveScript(); }}>
                  <Save size={14} /> Save script as file
                </button>
              </>
            ) : (
              <button className="export-menu__item" onClick={() => { setOpen(false); onGenerate(); }}>
                <Play size={14} /> Generate now
              </button>
            )}
          </div>
          <div className="export-menu__section">
            <div className="export-menu__title">Selectors</div>
            <div className="export-menu__hint">For object-repository workflows. Two columns: name + selector.</div>
            <div className="export-menu__row">
              {["csv", "json", "yaml", "xml"].map((f) => (
                <button key={f} className="export-menu__chip" onClick={() => exportSelectorsAs(f)}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="export-menu__section">
            <div className="export-menu__title">LLM prompt</div>
            <div className="export-menu__hint">Hand off to Claude / GPT / Gemini. Useful for frameworks Harness doesn't ship directly.</div>
            <button className="export-menu__item" onClick={() => { setOpen(false); setLlmOpen(true); }}>
              <Save size={14} /> Build LLM prompt…
            </button>
          </div>
        </div>
      )}
      {llmOpen && <LlmPromptDialog sessionId={sessionId} onClose={() => setLlmOpen(false)} />}
    </div>
  );
}

