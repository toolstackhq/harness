// Encode a WebM walkthrough video using <canvas>.captureStream() +
// MediaRecorder. Pure browser API, no native deps, no ffmpeg.

import { probeCanvasSize, renderSlideFrame, groupStepsToSlides, sleep } from "./renderWalkthroughFrames.js";

const MIME_PREFERENCES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

function pickMime() {
  for (const m of MIME_PREFERENCES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

export async function encodeWalkthroughVideo(steps, { fps = 4, holdMs = 2000, onProgress } = {}) {
  if (!steps.length) throw new Error("No steps to encode");
  const { w, h } = await probeCanvasSize(steps);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  // Chromium's canvas.captureStream() only emits frames when the canvas is
  // attached to the document. Off-DOM canvases produce empty streams, so
  // park it offscreen for the duration of the encode.
  canvas.style.cssText = "position:fixed;left:-99999px;top:0;pointer-events:none;opacity:0;z-index:-1;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#202124";
  ctx.fillRect(0, 0, w, h);

  try {
    const stream = canvas.captureStream(0); // manual frame pacing via requestFrame()
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, {
      mimeType: pickMime(),
      videoBitsPerSecond: 2_500_000
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(250);

    const slides = groupStepsToSlides(steps);
    const frameInterval = Math.round(1000 / fps);

    for (let i = 0; i < slides.length; i++) {
      onProgress?.(i, slides.length);
      await renderSlideFrame(ctx, slides[i], i, slides.length, w, h);
      const slideHold = slides[i].kind === "page"
        ? holdMs + 500 * Math.max(0, slides[i].actions.length - 1)
        : holdMs;
      const framesThisSlide = Math.max(1, Math.round((slideHold / 1000) * fps));
      // Drive the captureStream manually so each rendered frame becomes a
      // recorded frame (rather than relying on auto-pacing, which Chromium
      // sometimes drops for off-screen canvases).
      for (let f = 0; f < framesThisSlide; f++) {
        if (typeof track.requestFrame === "function") track.requestFrame();
        await sleep(frameInterval);
      }
    }
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, w, h);
    if (typeof track.requestFrame === "function") track.requestFrame();
    await sleep(400);

    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    await stopped;
    onProgress?.(slides.length, slides.length);

    const blob = new Blob(chunks, { type: "video/webm" });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    try { canvas.remove(); } catch (_) {}
  }
}
