// Encode a WebM walkthrough video using <canvas>.captureStream() +
// MediaRecorder. Pure browser API, no native deps, no ffmpeg.

import { probeCanvasSize, renderStepFrame, sleep } from "./renderWalkthroughFrames.js";

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
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#202124";
  ctx.fillRect(0, 0, w, h);

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: pickMime(),
    videoBitsPerSecond: 2_500_000
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(250);

  for (let i = 0; i < steps.length; i++) {
    onProgress?.(i, steps.length);
    await renderStepFrame(ctx, steps[i], i, steps.length, w, h);
    await sleep(holdMs);
  }
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, w, h);
  await sleep(400);

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await stopped;
  onProgress?.(steps.length, steps.length);

  const blob = new Blob(chunks, { type: "video/webm" });
  return new Uint8Array(await blob.arrayBuffer());
}
