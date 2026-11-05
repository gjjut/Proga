#!/usr/bin/env node
/**
 * Генерирует assets/icon.png (512×512) — фирменный знак приложения:
 * скруглённый квадрат с чёрно-белым градиентом и тремя тёмными восходящими полосами.
 * Никаких зависимостей: PNG собирается вручную через zlib.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
const SS = 3; // суперсэмплинг для сглаживания
const W = SIZE * SS;

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(rootDir, 'assets/icon.png');

/** @type {Float32Array} RGBA-буфер */
const buffer = new Float32Array(W * W * 4);

function setPixel(x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const i = (y * W + x) * 4;
  buffer[i] = r;
  buffer[i + 1] = g;
  buffer[i + 2] = b;
  buffer[i + 3] = a;
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// ── 1. Фон: скруглённый квадрат с диагональным градиентом ──
const radius = W * 0.235;
const top = [0xff, 0xff, 0xff];
const bottom = [0x6f, 0x76, 0x7d];

for (let y = 0; y < W; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!insideRoundedRect(x + 0.5, y + 0.5, 0, 0, W, W, radius)) continue;
    const t = Math.min(1, Math.max(0, (x / W) * 0.35 + (y / W) * 0.75));
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    setPixel(x, y, r, g, b, 1);
  }
}

// ── 2. Три тёмные полосы (как в BrandMark) ──
const barWidth = W * 0.098;
const bars = [
  { x: W * 0.298, y2: W * 0.7, y1: W * 0.545 },
  { x: W * 0.5, y2: W * 0.7, y1: W * 0.412 },
  { x: W * 0.702, y2: W * 0.7, y1: W * 0.3 },
];

for (const bar of bars) {
  const half = barWidth / 2;
  const minY = Math.floor(bar.y1 - half - 1);
  const maxY = Math.ceil(bar.y2 + half + 1);
  const minX = Math.floor(bar.x - half - 1);
  const maxX = Math.ceil(bar.x + half + 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = distanceToSegment(x + 0.5, y + 0.5, bar.x, bar.y1, bar.x, bar.y2);
      if (distance > half) continue;
      setPixel(x, y, 0x10, 0x12, 0x15, 1);
    }
  }
}

// ── 3. Даунсэмплинг W×W → SIZE×SIZE ──
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
        const alpha = buffer[i + 3];
        r += buffer[i] * alpha;
        g += buffer[i + 1] * alpha;
        b += buffer[i + 2] * alpha;
        a += alpha;
      }
    }
    const index = (y * SIZE + x) * 4;
    if (a > 0) {
      out[index] = Math.round(r / a);
      out[index + 1] = Math.round(g / a);
      out[index + 2] = Math.round(b / a);
    }
    out[index + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

// ── 4. Кодирование PNG ──
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0; // фильтр None
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(bufferIn) {
  let c = 0xffffffff;
  for (const byte of bufferIn) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`✓ assets/icon.png (${SIZE}×${SIZE}, ${(png.length / 1024).toFixed(1)} КБ)`);
