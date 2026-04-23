import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import BrowserToolbar from "./BrowserToolbar.jsx";
import InfoBar from "./InfoBar.jsx";
import StepList from "./StepList.jsx";

export default function RecordingScreen({
  session,
  initialSteps,
  autoReplay,
  onNewSession,
  onAddNote,
  onStepsChange
}) {
  const [url, setUrl] = useState(session.url);
  const [steps, setSteps] = useState(initialSteps || []);
  const [counts, setCounts] = useState({
    stepCount: initialSteps?.length || 0,
    shadowCount: 0,
    warningCount: 0
  });
  const [recording, setRecording] = useState(!session.stopped);
  const [replayState, setReplayState] = useState("idle");
  const [replayStatuses, setReplayStatuses] = useState({});
  const [replaySummary, setReplaySummary] = useState(null);
  const paneRef = useRef(null);

  const pushBounds = () => {
    if (!paneRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    window.recrd.browser.setBounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
  };

  useLayoutEffect(() => {
    pushBounds();
    const onResize = () => pushBounds();
    window.addEventListener("resize", onResize);
    const interval = setInterval(pushBounds, 500);
    return () => { window.removeEventListener("resize", onResize); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const offStep = window.recrd.recorder.onStep(({ step, stepCount, shadowCount, warningCount }) => {
      setSteps((prev) => {
        if (step.kind === "fill") {
          const last = prev[prev.length - 1];
          if (last?.kind === "fill" && last.locator?.css === step.locator?.css) {
            const next = prev.slice(0, -1);
            next.push(step);
            return next;
          }
        }
        return [...prev, step];
      });
      setCounts({ stepCount, shadowCount, warningCount });
    });
    const offCleared = window.recrd.recorder.onCleared(() => {
      setSteps([]);
      setCounts({ stepCount: 0, shadowCount: 0, warningCount: 0 });
      setReplaySummary(null);
      setReplayStatuses({});
    });
    const offUrl = window.recrd.browser.onUrlChanged(({ url }) => setUrl(url));
    const offStopped = window.recrd.recorder.onStopped(() => {
      setRecording(false);
    });
    return () => { offStep(); offCleared(); offUrl(); offStopped(); };
  }, []);

  useEffect(() => {
    const offStarted = window.recrd.replay.onStarted(() => {
      setReplayState("running");
      setReplayStatuses({});
      setReplaySummary(null);
    });
    const offPass = window.recrd.replay.onStepPass(({ stepIndex, durationMs }) => {
      setReplayStatuses((prev) => ({ ...prev, [stepIndex]: { status: "pass", durationMs } }));
    });
    const offFail = window.recrd.replay.onStepFail(({ stepIndex, error, durationMs }) => {
      setReplayStatuses((prev) => ({ ...prev, [stepIndex]: { status: "fail", error, durationMs } }));
    });
    const offDone = window.recrd.replay.onComplete(({ passed, failed, total }) => {
      setReplayState("done");
      setReplaySummary({ passed, failed, total });
    });
    return () => { offStarted(); offPass(); offFail(); offDone(); };
  }, []);

  useEffect(() => {
    if (autoReplay && (initialSteps?.length || 0) > 0) {
      setReplayStatuses({});
      setReplaySummary(null);
      setReplayState("running");
      window.recrd.replay.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReplay]);

  useEffect(() => { onStepsChange?.(steps); }, [steps, onStepsChange]);

  // Show a "running" indicator on the in-flight step. We detect it as the
  // lowest index that has no status yet, provided replay is running.
  const runningIndex = (() => {
    if (replayState !== "running") return -1;
    for (let i = 0; i < steps.length; i += 1) {
      if (!replayStatuses[i]) return i;
    }
    return -1;
  })();
  const mergedStatuses = { ...replayStatuses };
  if (runningIndex >= 0) mergedStatuses[runningIndex] = { status: "running" };

  const onClear = async () => {
    await window.recrd.recorder.clear();
    setReplaySummary(null);
    setReplayStatuses({});
  };
  const onStop = async () => { await window.recrd.recorder.stop(); };
  const onReplay = async () => {
    setReplayStatuses({});
    setReplaySummary(null);
    setReplayState("running");
    await window.recrd.replay.start();
  };

  return (
    <div className="recording">
      <BrowserToolbar
        url={url}
        startedAt={session.startedAt}
        recording={recording}
        onNavigate={(u) => window.recrd.browser.navigate(u)}
        onBack={() => window.recrd.browser.back()}
        onForward={() => window.recrd.browser.forward()}
        onReload={() => window.recrd.browser.reload()}
        onNewSession={onNewSession}
        canAddNote={true}
        onAddNote={onAddNote}
      />
      <InfoBar
        cdp={recording}
        framework={session.framework}
        steps={counts.stepCount}
        shadows={counts.shadowCount}
        warnings={counts.warningCount}
      />
      <div className="recording__body">
        <div className="browser-pane" ref={paneRef}>
          {/* WebContentsView layered on top by the main process */}
        </div>
        <StepList
          steps={steps}
          recording={recording}
          replayState={replayState}
          replayStatuses={mergedStatuses}
          replaySummary={replaySummary}
          onClear={onClear}
          onStop={onStop}
          onReplay={onReplay}
        />
      </div>
    </div>
  );
}
