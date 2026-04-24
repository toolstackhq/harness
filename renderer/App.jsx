import React, { useEffect, useState } from "react";
import AppBar from "./components/AppBar.jsx";
import Breadcrumb from "./components/Breadcrumb.jsx";
import StartupScreen from "./components/StartupScreen.jsx";
import RecordingScreen from "./components/RecordingScreen.jsx";
import ScriptDialog from "./components/ScriptDialog.jsx";
import SessionDetailModal from "./components/SessionDetailModal.jsx";
import JourneyExportDialog from "./components/JourneyExportDialog.jsx";
import NoteComposer from "./components/NoteComposer.jsx";
import StepEditDialog from "./components/StepEditDialog.jsx";
import AssertionDialog from "./components/AssertionDialog.jsx";
import CaptureOverlay from "./components/CaptureOverlay.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [initialSteps, setInitialSteps] = useState(null);
  const [autoReplay, setAutoReplay] = useState(0);
  const [steps, setSteps] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [journey, setJourney] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [assertOpen, setAssertOpen] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [capture, setCapture] = useState(null);
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
      stopped: false,
      name: null
    });
    setInitialSteps([]);
    setSteps([]);
  };

  const onNewSession = async () => {
    await window.recrd.recorder.close();
  };

  const onAddNote = () => {
    if (!session) return;
    setNoteOpen(true);
  };
  const saveNote = async (text) => {
    const result = await window.recrd.recorder.addNote(text);
    if (!result?.ok) {
      alert(result?.error || "Failed to add note.");
      return false;
    }
    return true;
  };

  const onAddAssertion = () => {
    if (!session) return;
    setAssertOpen(true);
  };
  const saveAssertion = async (payload) => {
    const result = await window.recrd.recorder.addAssertion(payload);
    if (!result?.ok) {
      alert(result?.error || "Failed to add assertion.");
      return false;
    }
    return true;
  };

  const onCaptureArea = async () => {
    if (!session) return;
    const snap = await window.recrd.capture.snapshot();
    if (!snap?.ok) { alert(snap?.error || "Could not capture the page."); return; }
    await window.recrd.browser.setVisible(false);
    setCapture({ dataUrl: snap.dataUrl, url: snap.url });
  };
  const closeCapture = async () => {
    setCapture(null);
    if (session) await window.recrd.browser.setVisible(true);
  };
  const saveCapture = async ({ screenshot, rect, text, url }) => {
    const result = await window.recrd.capture.save({ screenshot, rect, text, url });
    if (!result?.ok) {
      alert(result?.error || "Failed to save capture.");
      return false;
    }
    return true;
  };

  const onRenameSession = async (name) => {
    const result = await window.recrd.sessions.setActiveName(name);
    if (result?.ok) setSession((s) => s ? { ...s, name: result.name } : s);
  };

  const onEditStep = (step) => setEditingStep(step);
  const saveStepEdit = async (patch) => {
    if (!editingStep) return false;
    if (Object.keys(patch).length === 0) return true;
    const result = await window.recrd.recorder.updateStep(editingStep.number, patch);
    if (!result?.ok) {
      alert(result?.error || "Failed to update step.");
      return false;
    }
    return true;
  };
  const onDeleteStep = async (step) => {
    if (!step?.number) return;
    const confirmed = window.confirm(`Delete step ${String(step.number).padStart(2, "0")}?`);
    if (!confirmed) return;
    await window.recrd.recorder.deleteStep(step.number);
  };

  const lastInteractiveSelector = (() => {
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      const s = steps[i];
      if (s?.kind && s.kind !== "navigate" && s.kind !== "note" && s.kind !== "assert") {
        const loc = s.locator || {};
        return loc.css || loc.xpath || "";
      }
    }
    return "";
  })();

  useEffect(() => {
    const onKey = (e) => {
      if (!session) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setNoteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "A" || e.key === "a")) {
        if (session.recordType !== "doc") {
          e.preventDefault();
          setAssertOpen(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        onCaptureArea();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

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

  const canLeave = !session || session.stopped;
  const goHome = canLeave
    ? async () => { if (session) await window.recrd.recorder.close(); }
    : null;
  const homeTitle = canLeave ? "Back to sessions" : "Stop recording to leave";

  const breadcrumb = session
    ? [
        { label: "Recrd", onClick: goHome, title: homeTitle },
        { label: "Sessions", onClick: goHome, title: homeTitle },
        { label: session.stopped ? "Review" : "Recording" }
      ]
    : [
        { label: "Recrd" },
        { label: "Sessions" },
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
                disabled: steps.length === 0 || !session.stopped,
                title: !session.stopped
                  ? "Stop recording first"
                  : (steps.length === 0 ? "No steps yet" : "Generate output")
              }
            : null
        }
        secondary={
          session
            ? {
                label: session.recordType === "doc" ? "Export HTML" : "Export Journey",
                icon: "save",
                onClick: () => onOpenJourney("html"),
                disabled: steps.length === 0 || !session.stopped,
                title: !session.stopped
                  ? "Stop recording first"
                  : (steps.length === 0 ? "No steps yet" : "Export as HTML")
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
          onAddNote={onAddNote}
          onAddAssertion={onAddAssertion}
          onCaptureArea={onCaptureArea}
          onEditStep={onEditStep}
          onDeleteStep={onDeleteStep}
          sessionName={session.name}
          onRenameSession={onRenameSession}
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
      {noteOpen && (
        <NoteComposer
          onSave={saveNote}
          onClose={() => setNoteOpen(false)}
        />
      )}
      {assertOpen && (
        <AssertionDialog
          defaultSelector={lastInteractiveSelector}
          onSave={saveAssertion}
          onClose={() => setAssertOpen(false)}
        />
      )}
      {editingStep && (
        <StepEditDialog
          step={editingStep}
          onSave={saveStepEdit}
          onClose={() => setEditingStep(null)}
        />
      )}
      {capture && (
        <CaptureOverlay
          dataUrl={capture.dataUrl}
          url={capture.url}
          onSave={saveCapture}
          onClose={closeCapture}
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
