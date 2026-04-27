// Canvas drawing helpers shared by WebM (MediaRecorder) and MP4 (WebCodecs)
// encoders. No encoder-specific code here.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundEven(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

export async function probeCanvasSize(steps, fallback = { w: 1280, h: 800 }) {
  for (const step of steps) {
    if (!step.screenshot) continue;
    try {
      const img = await loadImage(step.screenshot);
      return {
        w: roundEven(Math.min(img.width, 1600)),
        h: roundEven(Math.min(img.height, 1200))
      };
    } catch (_) {}
  }
  return { w: roundEven(fallback.w), h: roundEven(fallback.h) };
}

const ACTION_KINDS = new Set(["click", "fill", "select", "check", "press", "submit", "assert"]);

export function groupStepsToSlides(steps) {
  const slides = [];
  let buffer = null;
  const flush = () => {
    if (!buffer) return;
    if (buffer.actions.length === 1) slides.push({ kind: "single", step: buffer.actions[0] });
    else slides.push(buffer);
    buffer = null;
  };
  for (const step of steps) {
    if (ACTION_KINDS.has(step.kind)) {
      if (!buffer) buffer = { kind: "page", actions: [], screenshot: null, url: step.url || "" };
      buffer.actions.push(step);
      if (step.screenshot) buffer.screenshot = step.screenshot;
      continue;
    }
    flush();
    slides.push({ kind: "single", step });
  }
  flush();
  return slides;
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
  const maxWidth = w * 0.8;
  const words = String(body).split(/\s+/);
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

function drawActionList(ctx, actions, index, total, w, h) {
  const padX = 22;
  const lineH = 22;
  const headerH = 28;
  const maxLines = Math.min(actions.length, 6);
  const barH = headerH + lineH * maxLines + 12;
  ctx.fillStyle = "rgba(32, 33, 36, 0.92)";
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 12px 'Roboto Mono', monospace";
  ctx.textBaseline = "top";
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")} · Page actions (${actions.length})`, padX, h - barH + 8);
  ctx.fillStyle = "white";
  ctx.font = "500 14px 'Google Sans', system-ui, sans-serif";
  for (let i = 0; i < maxLines; i += 1) {
    const { headline, body } = describeStep(actions[i]);
    const text = `• ${headline}: ${body}`;
    const truncated = text.length > 130 ? text.slice(0, 127) + "…" : text;
    ctx.fillText(truncated, padX, h - barH + headerH + i * lineH);
  }
  if (actions.length > maxLines) {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "400 12px 'Google Sans', system-ui, sans-serif";
    ctx.fillText(`+ ${actions.length - maxLines} more`, padX, h - barH + headerH + maxLines * lineH - 4);
  }
}

export async function renderSlideFrame(ctx, slide, index, total, w, h) {
  if (slide.kind === "page") {
    const last = [...slide.actions].reverse().find((s) => s.screenshot) || slide.actions[0];
    const usableH = h - (28 + 22 * Math.min(slide.actions.length, 6) + 12);
    if (last?.screenshot) {
      try {
        const img = await loadImage(last.screenshot);
        ctx.fillStyle = "#202124";
        ctx.fillRect(0, 0, w, h);
        const scale = Math.min(w / img.width, usableH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (w - dw) / 2;
        const dy = (usableH - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      } catch (_) {
        ctx.fillStyle = "#1a73e8";
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = "#1a73e8";
      ctx.fillRect(0, 0, w, h);
    }
    drawActionList(ctx, slide.actions, index, total, w, h);
    return;
  }
  await renderStepFrame(ctx, slide.step, index, total, w, h);
}

export async function renderStepFrame(ctx, step, index, total, w, h) {
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function isMp4Supported() {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.42E028",
      width: 1280,
      height: 720,
      bitrate: 2_500_000,
      framerate: 4
    });
    return support?.supported === true;
  } catch (_) {
    return false;
  }
}
