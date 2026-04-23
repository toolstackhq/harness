import React, { useEffect, useState } from "react";
import AppBar from "./components/AppBar.jsx";
import Breadcrumb from "./components/Breadcrumb.jsx";
import StartupScreen from "./components/StartupScreen.jsx";
import RecordingScreen from "./components/RecordingScreen.jsx";
import ScriptDialog from "./components/ScriptDialog.jsx";
import SessionDetailModal from "./components/SessionDetailModal.jsx";
import JourneyExportDialog from "./components/JourneyExportDialog.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [initialSteps, setInitialSteps] = useState(null);
  const [autoReplay, setAutoReplay] = useState(0);
  const [steps, setSteps] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [journey, setJourney] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const off = window.recrd.recorder.onError(({ message }) => {
      alert(`Recorder error: ${message}`);
    });
    return () => off();
  }, []);

  useEffect(() => {
    const offClosed = window.recrd.recorder.onSessionClosed(() => {
      setSession(null);
      setInitialSteps(null);
      setSteps([]);
    });
    const offReplayLoaded = window.recrd.recorder.onReplayLoaded(({ session: replaySession, steps: replaySteps }) => {
      setDetail(null);
      setSession(replaySession);
      setInitialSteps(replaySteps);
      setAutoReplay((n) => n + 1);
    });
    return () => { offClosed(); offReplayLoaded(); };
  }, []);

  const onStart = async ({ recordType, framework, url }) => {
    setBusy(true);
    const result = await window.recrd.recorder.start({ recordType, framework, url });
    setBusy(false);
    if (!result.ok) {
      alert(`Failed to start recording: ${result.error}`);
      return;
    }
    setSession({
      framework: result.framework,
      recordType: recordType || "script",
      url: result.url,
      startedAt: Date.now(),
      stopped: false
    });
    setInitialSteps([]);
    setSteps([]);
  };

  const onNewSession = async () => {
    await window.recrd.recorder.close();
  };

  const onGenerate = async () => {
    if (!session) return;
    if (session.recordType === "doc") {
      return onOpenJourney("pdf");
    }
    const result = await window.recrd.script.generate({ framework: session.framework });
    if (!result.ok) {
      alert(result.error || "No steps yet.");
      return;
    }
    await window.recrd.browser.setVisible(false);
    setDialog({ code: result.code, framework: result.framework });
  };

  const closeDialog = async () => {
    setDialog(null);
    if (session) await window.recrd.browser.setVisible(true);
  };

  const onOpenJourney = async (defaultFormat = "html") => {
    if (!session) return;
    const result = await window.recrd.journey.getSteps();
    if (!result?.ok) {
      alert(result?.error || "No steps available.");
      return;
    }
    await window.recrd.browser.setVisible(false);
    setJourney({ steps: result.steps || [], defaultFormat });
  };

  const closeJourney = async () => {
    setJourney(null);
    if (session) await window.recrd.browser.setVisible(true);
  };

  const onReplaySession = async (sessionEntry) => {
    setDetail(null);
    setBusy(true);
    try {
      await window.recrd.sessions.replay(sessionEntry.id);
    } catch (err) {
      alert(`Replay failed: ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  };

  const breadcrumb = session
    ? [
        { label: "Recrd", onClick: () => {} },
        { label: "Sessions", onClick: () => {} },
        { label: session.stopped ? "Review" : "Recording" }
      ]
    : [
        { label: "Recrd", onClick: () => {} },
        { label: "Sessions", onClick: () => {} },
        { label: "New session" }
      ];

  return (
    <div className="app">
      <AppBar
        section={session ? (session.stopped ? "Review" : "Recording") : "New session"}
        primary={
          session
            ? {
                label: session.recordType === "doc" ? "Generate PDF" : "Generate Script",
                icon: session.recordType === "doc" ? "save" : "code",
                onClick: onGenerate,
                disabled: steps.length === 0
              }
            : null
        }
        secondary={
          session
            ? {
                label: session.recordType === "doc" ? "Export HTML" : "Export Journey",
                icon: "save",
                onClick: () => onOpenJourney("html"),
                disabled: steps.length === 0
              }
            : null
        }
      />
      <Breadcrumb items={breadcrumb} />
      {session ? (
        <RecordingScreen
          key={session.id || session.url}
          session={session}
          initialSteps={initialSteps}
          autoReplay={autoReplay}
          onNewSession={onNewSession}
          onStepsChange={setSteps}
        />
      ) : (
        <StartupScreen
          onStart={onStart}
          onOpenSession={(s) => setDetail(s)}
        />
      )}
      {dialog && (
        <ScriptDialog
          code={dialog.code}
          framework={dialog.framework}
          onClose={closeDialog}
          onCopy={() => window.recrd.script.copy(dialog.code)}
          onSave={() => window.recrd.script.save({ code: dialog.code, framework: dialog.framework })}
        />
      )}
      {journey && (
        <JourneyExportDialog
          steps={journey.steps}
          defaultFormat={journey.defaultFormat || "html"}
          onClose={closeJourney}
        />
      )}
      {detail && (
        <SessionDetailModal
          session={detail}
          onClose={() => setDetail(null)}
          onDelete={() => setDetail(null)}
          onReplay={onReplaySession}
          onUpdate={(updated) => setDetail(updated)}
        />
      )}
      {busy && <div className="dialog-backdrop"><div style={{ color: "white" }}>Starting…</div></div>}
    </div>
  );
}
