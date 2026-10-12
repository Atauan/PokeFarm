'use strict';
// Gera o ícone do PokeFarm (pokébola sobre degradê roxo→verde com selo "play") sem dependências.
// Saída: build/icon.png (1024 px, usado pelo electron-builder p/ Mac e Windows) e assets/icon.png (256 px).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const PURPLE = [120, 51, 242];
const GREEN = [51, 204, 64];
const RED = [237, 41, 51];
const DARK = [26, 26, 26];
const WHITE = [255, 255, 255];
const LIME = [84, 237, 26];

/** Cor (RGBA 0-255) num ponto (u, v) de 0..1, v para baixo. */
function sample(u, v) {
  const inset = 0.09;
  const rad = 0.2;
  // Quadrado arredondado
  const qx = Math.max(Math.abs(u - 0.5) - (0.5 - inset - rad), 0);
  const qy = Math.max(Math.abs(v - 0.5) - (0.5 - inset - rad), 0);
  if (Math.hypot(qx, qy) > rad) return [0, 0, 0, 0];
  const t = Math.min(Math.max((u + v - 2 * inset) / (2 - 4 * inset), 0), 1);
  let col = PURPLE.map((c, i) => lerp(c, GREEN[i], t));

  // Pokébola
  const r = 0.27;
  const d = Math.hypot(u - 0.5, v - 0.5);
  const line = 0.035;
  if (d <= r + line / 2) {
    col = v < 0.5 ? RED : WHITE;
    if (d > r - line / 2 || Math.abs(v - 0.5) < line / 2) col = DARK;
    const br = r * 0.32;
    if (d < br) col = d < br * 0.6 ? WHITE : DARK;
  }

  // Selo "play" no canto inferior direito
  const pr = 0.11;
  const pc = 1 - inset - pr * 1.25;
  const pd = Math.hypot(u - pc, v - pc);
  if (pd < pr) {
    col = col.map((c, i) => lerp(c, [20, 20, 20][i], 0.9));
    const x = (u - pc) / pr;
    const y = (v - pc) / pr;
    // Triângulo (-0.35,-0.5) (-0.35,0.5) (0.55,0)
    if (x > -0.35 && x < 0.55 && Math.abs(y) < 0.5 * (0.55 - x) / 0.9) col = LIME;
  }
  return [...col, 255];
}

function render(size) {
  const ss = 3;   // supersampling (bordas suaves)
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const o = (y * size + x) * 4;
      buf[o] = a ? r / a : 0; buf[o + 1] = a ? g / a : 0; buf[o + 2] = a ? b / a : 0; buf[o + 3] = a / (ss * ss);
    }
  }
  return png(size, buf);
}

const root = path.join(__dirname, '..');
for (const [dir, size] of [['build', 1024], ['assets', 256]]) {
  const out = path.join(root, dir, 'icon.png');
  if (fs.existsSync(out)) continue;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(size));
  console.log('ícone gerado:', path.relative(root, out));
}
