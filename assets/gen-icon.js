"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SIZE = 256;
const RADIUS = 44;
const BG = [0x1a, 0x73, 0xe8];
const FG = [0xff, 0xff, 0xff];
const INNER_R = 72;

function crc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function inRoundedSquare(x, y) {
  const inset = 16;
  if (x < inset || y < inset || x > SIZE - inset - 1 || y > SIZE - inset - 1) return false;
  const rx = Math.max(inset, Math.min(x, SIZE - inset - 1));
  const ry = Math.max(inset, Math.min(y, SIZE - inset - 1));
  const cornerCx = x < inset + RADIUS ? inset + RADIUS : (x > SIZE - inset - RADIUS - 1 ? SIZE - inset - RADIUS - 1 : x);
  const cornerCy = y < inset + RADIUS ? inset + RADIUS : (y > SIZE - inset - RADIUS - 1 ? SIZE - inset - RADIUS - 1 : y);
  const dx = x - cornerCx;
  const dy = y - cornerCy;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

function buildPixels() {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const innerR2 = INNER_R * INNER_R;
  const ringR2 = (INNER_R - 18) * (INNER_R - 18);
  const dotR2 = 22 * 22;
  const scanlines = [];
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 4);
    row[0] = 0;
    for (let x = 0; x < SIZE; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (inRoundedSquare(x, y)) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= dotR2) {
          r = FG[0]; g = FG[1]; b = FG[2]; a = 255;
        } else if (d2 <= innerR2 && d2 >= ringR2) {
          r = FG[0]; g = FG[1]; b = FG[2]; a = 255;
        } else {
          r = BG[0]; g = BG[1]; b = BG[2]; a = 255;
        }
      }
      const i = 1 + x * 4;
      row[i] = r; row[i + 1] = g; row[i + 2] = b; row[i + 3] = a;
    }
    scanlines.push(row);
  }
  return Buffer.concat(scanlines);
}

function buildPng() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idatRaw = buildPixels();
  const idat = zlib.deflateSync(idatRaw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const out = path.join(__dirname, "icon.png");
fs.writeFileSync(out, buildPng());
console.log("wrote", out);
