import React, { useEffect, useRef, useState } from "react";
import { Close, Save } from "./Icons.jsx";

export default function CaptureOverlay({ dataUrl, url, onSave, onClose }) {
  const [phase, setPhase] = useState("drawing"); // drawing | annotating
  const [rect, setRect] = useState(null);         // { left, top, width, height } in px
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);                       // {x0,y0,x,y}
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseDown = (e) => {
    if (phase !== "drawing") return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    drag.current = { x0: x, y0: y, x, y };
    setRect({ left: x, top: y, width: 0, height: 0 });
  };
  const onMouseMove = (e) => {
    if (!drag.current || phase !== "drawing") return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, e.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, e.clientY - bounds.top));
    drag.current.x = x;
    drag.current.y = y;
    const { x0, y0 } = drag.current;
    setRect({
      left: Math.min(x0, x),
      top: Math.min(y0, y),
      width: Math.abs(x - x0),
      height: Math.abs(y - y0)
    });
  };
  const onMouseUp = () => {
    if (!drag.current || phase !== "drawing") return;
    drag.current = null;
    if (!rect || rect.width < 6 || rect.height < 6) {
      setRect(null);
      return;
    }
    setPhase("annotating");
  };

  const resetDraw = () => {
    setRect(null);
    setText("");
    setPhase("drawing");
  };

  const save = async () => {
    if (busy || !rect) return;
    setBusy(true);
    try {
      const bounds = canvasRef.current.getBoundingClientRect();
      const rectPct = {
        x: (rect.left / bounds.width) * 100,
        y: (rect.top / bounds.height) * 100,
        width: (rect.width / bounds.width) * 100,
        height: (rect.height / bounds.height) * 100
      };
      const ok = await onSave?.({ screenshot: dataUrl, rect: rectPct, text: text.trim(), url });
      if (ok !== false) onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const popupStyle = rect
    ? {
        left: Math.min(rect.left + rect.width + 12, (canvasRef.current?.clientWidth || 1200) - 320),
        top: Math.max(8, rect.top)
      }
    : null;

  return (
    <div className="capture-overlay" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <div className="capture-stage" ref={canvasRef}>
        <img ref={imgRef} src={dataUrl} alt="Page snapshot" draggable={false} />
        {rect && (
          <div
            className="capture-rect"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
        )}
        {phase === "annotating" && popupStyle && (
          <div
            className="capture-popup"
            style={popupStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="capture-popup__title">Annotate this area</div>
            <textarea
              autoFocus
              className="field__textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Balance row highlights the available funds after the latest transfer."
              style={{ minHeight: 100, fontSize: 13 }}
            />
            <div className="capture-popup__actions">
              <button className="btn btn--secondary" onClick={resetDraw}>Redraw</button>
              <button className="btn btn--primary" onClick={save} disabled={busy}>
                <Save size={14} /> {busy ? "Saving…" : "Save capture"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="capture-hud">
        <div className="capture-hud__text">
          {phase === "drawing" ? "Drag to select an area — Esc to cancel" : "Annotate or click Redraw"}
        </div>
        <button className="btn btn--danger" onClick={onClose}>
          <Close size={14} /> Cancel
        </button>
      </div>
    </div>
  );
}
