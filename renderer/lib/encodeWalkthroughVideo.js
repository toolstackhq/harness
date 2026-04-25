// Encodes a walkthrough video from step screenshots using a hidden canvas
// + MediaRecorder. WebM (VP9 if supported, else default). Pure browser API,
// no ffmpeg, no native deps.

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function probeSize(steps, fallback = { w: 1280, h: 800 }) {
  for (const step of steps) {
    if (!step.screenshot) continue;
    try {
      const img = await loadImage(step.screenshot);
      return { w: Math.min(img.width, 1600), h: Math.min(img.height, 1200) };
    } catch (_) {}
  }
  return fallback;
}

function describeStep(step) {
  if (step.kind === "navigate") return { headline: "Navigate", body: step.url || "" };
  if (step.kind === "note") return { headline: "Note", body: step.text || "" };
  if (step.kind === "capture") return { headline: "Capture", body: step.text || "(annotated region)" };
  if (step.kind === "wait") return { headline: "Wait", body: `${Number(step.ms) || 0}ms` };
  if (step.kind === "assert") {
    const sel = step.locator?.css || "";
    const t = step.assertionType || "visible";
    return { headline: "Expect", body: `${sel} ${t}${step.expected ? ` ${JSON.stringify(step.expected)}` : ""}` };
  }
  const loc = step.locator || {};
  const target = loc.label || loc.name || loc.text || loc.css || step.kind;
  if (step.kind === "fill") return { headline: "Fill", body: `${target} = ${JSON.stringify(step.value ?? "")}` };
  if (step.kind === "select") return { headline: "Select", body: `${target} = ${JSON.stringify(step.value ?? "")}` };
  if (step.kind === "check") return { headline: step.checked ? "Check" : "Uncheck", body: target };
  if (step.kind === "press") return { headline: `Press ${step.key || "Enter"}`, body: target };
  if (step.kind === "submit") return { headline: "Submit", body: target };
  if (step.kind === "click") return { headline: "Click", body: target };
  return { headline: step.kind, body: target };
}

function drawCaption(ctx, step, index, total, w, h) {
  const { headline, body } = describeStep(step);
  const padY = 14;
  const padX = 22;
  const barH = 64;

  ctx.fillStyle = "rgba(32, 33, 36, 0.92)";
  ctx.fillRect(0, h - barH, w, barH);

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 12px 'Roboto Mono', monospace";
  ctx.textBaseline = "top";
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, padX, h - barH + padY);

  ctx.fillStyle = "white";
  ctx.font = "500 18px 'Google Sans', system-ui, sans-serif";
  ctx.fillText(headline, padX + 64, h - barH + padY);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "400 13px 'Google Sans', system-ui, sans-serif";
  const truncated = body.length > 110 ? body.slice(0, 107) + "…" : body;
  ctx.fillText(truncated, padX + 64, h - barH + padY + 22);
}

function drawScreenshot(ctx, img, w, h) {
  // Fit-letterbox the screenshot into (w, h - bottomBar). Background dark.
  ctx.fillStyle = "#202124";
  ctx.fillRect(0, 0, w, h);
  const usableH = h - 64;
  const scale = Math.min(w / img.width, usableH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) / 2;
  const dy = (usableH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return { dx, dy, dw, dh };
}

function drawBbox(ctx, rect, viewport, frame) {
  if (!rect || !viewport || !viewport.width || !viewport.height) return;
  const bx = frame.dx + (rect.x / viewport.width) * frame.dw;
  const by = frame.dy + (rect.y / viewport.height) * frame.dh;
  const bw = (rect.width / viewport.width) * frame.dw;
  const bh = (rect.height / viewport.height) * frame.dh;
  ctx.strokeStyle = "#1a73e8";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
  // soft halo
  ctx.fillStyle = "rgba(26,115,232,0.12)";
  ctx.fillRect(bx, by, bw, bh);
}

function drawCaptureRect(ctx, percentRect, frame) {
  if (!percentRect) return;
  const bx = frame.dx + (percentRect.x / 100) * frame.dw;
  const by = frame.dy + (percentRect.y / 100) * frame.dh;
  const bw = (percentRect.width / 100) * frame.dw;
  const bh = (percentRect.height / 100) * frame.dh;
  ctx.strokeStyle = "#1a73e8";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
}

function drawTextFrame(ctx, step, w, h) {
  ctx.fillStyle = "#1a73e8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "white";
  ctx.font = "500 28px 'Google Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  const { headline, body } = describeStep(step);
  ctx.fillText(headline, w / 2, h / 2 - 30);
  ctx.font = "400 18px 'Google Sans', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  // wrap body
  const maxWidth = w * 0.8;
  const words = body.split(/\s+/);
  let line = "";
  let yy = h / 2 + 10;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, w / 2, yy);
      line = word;
      yy += 24;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, w / 2, yy);
  ctx.textAlign = "left";
}

async function renderFrame(ctx, step, index, total, w, h) {
  if (step.screenshot) {
    try {
      const img = await loadImage(step.screenshot);
      const frame = drawScreenshot(ctx, img, w, h);
      if (step.kind === "capture" && step.rect) {
        drawCaptureRect(ctx, step.rect, frame);
      } else if (step.kind !== "navigate" && step.locator?.rect && step.locator?.viewport) {
        drawBbox(ctx, step.locator.rect, step.locator.viewport, frame);
      }
    } catch (_) {
      drawTextFrame(ctx, step, w, h);
    }
  } else {
    drawTextFrame(ctx, step, w, h);
  }
  drawCaption(ctx, step, index, total, w, h);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function encodeWalkthroughVideo(steps, { fps = 4, holdMs = 2000, onProgress } = {}) {
  if (!steps.length) throw new Error("No steps to encode");
  const { w, h } = await probeSize(steps);
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
    await renderFrame(ctx, steps[i], i, steps.length, w, h);
    await sleep(holdMs);
  }

  // Final fade-out frame
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, w, h);
  await sleep(400);

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await stopped;
  onProgress?.(steps.length, steps.length);

  const blob = new Blob(chunks, { type: "video/webm" });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}
