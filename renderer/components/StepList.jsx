import React, { useEffect, useRef, useState } from "react";
import { actionIcon, Check, Close, Spinner, Play } from "./Icons.jsx";

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

function Row({ step, live, replayStatus, replayDim, replayError, replayDuration }) {
  const [expanded, setExpanded] = useState(false);
  const loc = step.locator || {};
  const hasShadow = Array.isArray(loc.shadowChain) && loc.shadowChain.length > 0;
  const ambiguous = loc.ambiguous || (loc.matchedCount && loc.matchedCount > 1);
  const ActionIcon = actionIcon(step.kind);
  const { action, target } = describe(step);

  const isNote = step.kind === "note";
  const cls = ["step", "step--clickable"];
  if (replayStatus === "running" && !isNote) cls.push("step--running");
  else if (replayStatus === "pass" && !isNote) cls.push("step--pass");
  else if (replayStatus === "fail") cls.push("step--fail");
  else if (live) cls.push("step--live");
  else if (isNote) cls.push("step--note-type");
  else if (hasShadow) cls.push("step--shadow");
  if (replayDim) cls.push("step--dim");
  if (expanded) cls.push("step--expanded");

  const selector = step.kind === "navigate" ? step.url : (loc.css || loc.xpath || "");

  let iconEl;
  if (replayStatus === "running") iconEl = <Spinner size={14} />;
  else if (replayStatus === "pass") iconEl = <Check size={14} />;
  else if (replayStatus === "fail") iconEl = <Close size={14} />;
  else iconEl = <ActionIcon size={14} />;

  const iconCls = ["step__icon"];
  if (replayStatus === "pass") iconCls.push("step__icon--pass");
  else if (replayStatus === "fail") iconCls.push("step__icon--fail");

  const fullSelector = (hasShadow ? loc.shadowChain.join(" » ") + " » " : "") + selector;
  const onClick = () => setExpanded((v) => !v);
  return (
    <div className={cls.join(" ")} onClick={onClick} title={expanded ? "Click to collapse" : fullSelector}>
      <div className="step__num">{String(step.number || "").padStart(2, "0")}</div>
      <div className={iconCls.join(" ")}>{iconEl}</div>
      <div className="step__body">
        <div className="step__action">
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>{action}</span>
          {live && <span className="live-cursor" />}
          {typeof replayDuration === "number" && replayStatus === "pass" && (
            <span className="step__duration">{replayDuration}ms</span>
          )}
        </div>
        {isNote ? (
          <div className="step__note-text">{step.text || ""}</div>
        ) : (
          <div className="step__selector">
            {hasShadow && (
              <span className="step__shadow-chain">{loc.shadowChain.join(" » ")} » </span>
            )}
            {selector}
          </div>
        )}
        {replayStatus === "fail" && replayError && (
          <div className="step__error" title={replayError}>{replayError}</div>
        )}
        {(hasShadow || ambiguous) && replayStatus !== "fail" && (
          <div className="step__badges">
            {hasShadow && <span className="step__badge step__badge--shadow">SHADOW</span>}
            {ambiguous && <span className="step__badge step__badge--warn">AMBIGUOUS</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StepList({
  steps,
  recording,
  replayState,
  replayStatuses,
  replaySummary,
  onClear,
  onStop,
  onReplay
}) {
  const bodyRef = useRef(null);
  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [steps.length]);

  const liveIndex = recording ? steps.length - 1 : -1;
  const isReplaying = replayState === "running";
  const canReplay = !recording && steps.length > 0 && replayState !== "running";

  return (
    <div className="side-panel">
      <div className="side-panel__header">
        <div className="side-panel__title">Recorded steps</div>
        <div className="side-panel__count">{steps.length}</div>
      </div>
      {!recording && steps.length > 0 && replayState !== "running" && !replaySummary && (
        <div className="info-banner">Recording stopped. Review steps below.</div>
      )}
      <div className="side-panel__body" ref={bodyRef}>
        {steps.length === 0 ? (
          <div className="side-panel__empty">Interact with the browser to record steps.</div>
        ) : (
          steps.map((step, i) => {
            const status = replayStatuses?.[i];
            const dim = isReplaying && !status;
            return (
              <Row
                key={step.number || i}
                step={step}
                live={i === liveIndex}
                replayStatus={status?.status}
                replayDim={dim}
                replayError={status?.error}
                replayDuration={status?.durationMs}
              />
            );
          })
        )}
      </div>
      {replaySummary && (
        <div className={`summary-bar summary-bar--${replaySummary.failed > 0 ? "fail" : "pass"}`}>
          {replaySummary.failed > 0
            ? `✗ ${replaySummary.passed}/${replaySummary.total} steps passed — ${replaySummary.failed} failed`
            : `✓ ${replaySummary.passed}/${replaySummary.total} steps passed`}
        </div>
      )}
      <div className="side-panel__footer">
        <button className="btn btn--danger" onClick={onClear} disabled={isReplaying}>Clear</button>
        <button
          className="btn btn--secondary"
          onClick={onReplay}
          disabled={!canReplay}
          title={recording ? "Stop recording first" : steps.length === 0 ? "No steps to replay" : "Replay steps"}
        >
          <Play size={14} /> Replay
        </button>
        <button className="btn btn--secondary" onClick={onStop} disabled={!recording}>Stop</button>
      </div>
    </div>
  );
}
