import React, { useEffect, useRef, useState } from "react";
import { Close, Save } from "./Icons.jsx";

export default function CaptureOverlay({ dataUrl, url, onSave, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const rootRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let editor = null;
    (async () => {
      try {
        const [mod] = await Promise.all([
          import("tui-image-editor"),
          import("tui-image-editor/dist/tui-image-editor.css"),
          import("tui-color-picker/dist/tui-color-picker.css")
        ]);
        if (cancelled || !rootRef.current) return;
        const ImageEditor = mod.default || mod;
        editor = new ImageEditor(rootRef.current, {
          includeUI: {
            loadImage: { path: dataUrl, name: "snapshot" },
            menu: ["draw", "shape", "text", "icon", "crop"],
            initMenu: "draw",
            uiSize: { width: "100%", height: "100%" },
            menuBarPosition: "left"
          },
          cssMaxWidth: 2000,
          cssMaxHeight: 2000,
          usageStatistics: false
        });
        editorRef.current = editor;
        setEditorReady(true);
      } catch (err) {
        console.error("[capture] image editor failed to load:", err);
        alert("Image editor failed to load: " + (err?.message || err));
      }
    })();
    return () => {
      cancelled = true;
      try { editor?.destroy(); } catch (_) {}
      editorRef.current = null;
    };
  }, [dataUrl]);

  const save = async () => {
    if (busy || !editorRef.current) return;
    setBusy(true);
    try {
      const annotated = editorRef.current.toDataURL({ format: "png" });
      const ok = await onSave?.({
        screenshot: annotated,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        text: text.trim(),
        url
      });
      if (ok !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="capture-overlay">
      <div className="capture-stage capture-stage--editor">
        <div ref={rootRef} className="capture-editor-root" />
        {!editorReady && <div className="capture-editor-loading">Loading image editor…</div>}
      </div>
      <div className="capture-hud capture-hud--editor">
        <input
          className="field__input"
          placeholder="Caption (optional) — appears beside this capture in exports"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, fontSize: 13 }}
        />
        <button className="btn btn--secondary" onClick={onClose}>
          <Close size={14} /> Cancel
        </button>
        <button className="btn btn--primary" onClick={save} disabled={busy || !editorReady}>
          <Save size={14} /> {busy ? "Saving…" : "Save capture"}
        </button>
      </div>
    </div>
  );
}
