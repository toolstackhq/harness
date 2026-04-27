// Encode an MP4 walkthrough video using WebCodecs VideoEncoder (H.264)
// + mp4-muxer for the container. Pure browser, no native deps, no ffmpeg.

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { probeCanvasSize, renderSlideFrame, groupStepsToSlides, sleep } from "./renderWalkthroughFrames.js";

export async function encodeWalkthroughMp4(steps, { fps = 4, holdMs = 2000, onProgress } = {}) {
  if (!steps.length) throw new Error("No steps to encode");
  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs VideoEncoder not available in this build");
  }

  const { w, h } = await probeCanvasSize(steps);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // H.264 baseline level 4.0 — supports up to 2048×1024-ish at our framerates.
  const codec = "avc1.42E028";
  const config = {
    codec,
    width: w,
    height: h,
    bitrate: 2_500_000,
    framerate: fps
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support?.supported) {
    throw new Error("H.264 encoding not supported on this system");
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width: w,
      height: h,
      frameRate: fps
    },
    fastStart: "in-memory"
  });

  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try { muxer.addVideoChunk(chunk, meta); } catch (err) { encodeError = err; }
    },
    error: (err) => { encodeError = err; }
  });
  encoder.configure(config);

  // Each slide holds for `holdMs` (page slides scale with action count). Force
  // a keyframe on every new slide so seeks are clean.
  const slides = groupStepsToSlides(steps);
  const microPerFrame = Math.round(1_000_000 / fps);
  let frameIndex = 0;

  for (let i = 0; i < slides.length; i++) {
    onProgress?.(i, slides.length);
    await renderSlideFrame(ctx, slides[i], i, slides.length, w, h);
    const slideHold = slides[i].kind === "page"
      ? holdMs + 500 * Math.max(0, slides[i].actions.length - 1)
      : holdMs;
    const framesThisSlide = Math.max(1, Math.round((slideHold / 1000) * fps));
    for (let f = 0; f < framesThisSlide; f++) {
      if (encodeError) throw encodeError;
      const ts = frameIndex * microPerFrame;
      const videoFrame = new VideoFrame(canvas, { timestamp: ts });
      encoder.encode(videoFrame, { keyFrame: f === 0 });
      videoFrame.close();
      frameIndex += 1;
      if (frameIndex % 8 === 0) await sleep(0);
    }
  }
  // Fade-out closing frame
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, w, h);
  const fade = new VideoFrame(canvas, { timestamp: frameIndex * microPerFrame });
  encoder.encode(fade, { keyFrame: false });
  fade.close();
  frameIndex += 1;

  await encoder.flush();
  if (encodeError) throw encodeError;
  encoder.close();
  muxer.finalize();
  onProgress?.(slides.length, slides.length);

  return new Uint8Array(muxer.target.buffer);
}
