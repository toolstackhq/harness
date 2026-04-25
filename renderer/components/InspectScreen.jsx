import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import BrowserToolbar from "./BrowserToolbar.jsx";
import InspectorPanel from "./InspectorPanel.jsx";

export default function InspectScreen({ session, onNewSession }) {
  const [url, setUrl] = useState(session.url);
  const paneRef = useRef(null);

  const pushBounds = () => {
    if (!paneRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    window.harness.browser.setBounds({
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
    const offUrl = window.harness.browser.onUrlChanged(({ url }) => setUrl(url));
    return () => offUrl();
  }, []);

  return (
    <div className="recording">
      <BrowserToolbar
        url={url}
        recording={false}
        replaying={false}
        inspectMode={true}
        onNavigate={(u) => window.harness.browser.navigate(u)}
        onBack={() => window.harness.browser.back()}
        onForward={() => window.harness.browser.forward()}
        onReload={() => window.harness.browser.reload()}
        onNewSession={onNewSession}
      />
      <div className="recording__body">
        <div className="browser-pane" ref={paneRef} />
        <div className="side-panel">
          <div className="side-panel__header side-panel__header--stacked">
            <div className="session-name session-name--empty" style={{ cursor: "default" }}>Selector inspector</div>
            <div className="side-panel__meta">
              <span className="side-panel__subtitle">Test CSS or shadow-pierce selectors</span>
            </div>
          </div>
          <InspectorPanel fullHeight />
        </div>
      </div>
    </div>
  );
}
