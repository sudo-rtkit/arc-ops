// Vygeneruje zdrojovou ikonu 1024×1024 ze znaku aplikace (čtverec se čtyřmi krátkými linkami, visual-design.md kap. 4).
// Není to oficiální logo. Spuštění: node scripts/gen-icon.mjs && pnpm tauri icon src-tauri/icons/source.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 1024;
const px = Buffer.alloc(N * N * 4);
const BG = [0x10, 0x14, 0x19], PANEL = [0x19, 0x21, 0x28], ACC = [0x52, 0xdd, 0xd0];
const u = N / 28; /* jednotka znaku (viewBox 28) */

function put(x, y, c, a = 255) { const i = (y * N + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a; }
const inRound = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), N - 1 - r), cy = Math.min(Math.max(y, r), N - 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const sw = 1.9 * u;
const shapes = [
  /* čtverec 7..21 jako obrys */
  (x, y) => rect(7 * u - sw / 2, 7 * u - sw / 2, 21 * u + sw / 2, 21 * u + sw / 2)(x, y) && !rect(7 * u + sw / 2, 7 * u + sw / 2, 21 * u - sw / 2, 21 * u - sw / 2)(x, y),
  rect(14 * u - sw / 2, 1.6 * u, 14 * u + sw / 2, 5 * u),
  rect(14 * u - sw / 2, 23 * u, 14 * u + sw / 2, 26.4 * u),
  rect(1.6 * u, 14 * u - sw / 2, 5 * u, 14 * u + sw / 2),
  rect(23 * u, 14 * u - sw / 2, 26.4 * u, 14 * u + sw / 2),
];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (!inRound(x, y, 180)) { put(x, y, BG, 0); continue; }
  const inner = inRound(x, y, 180) && x > 24 && y > 24 && x < N - 25 && y < N - 25;
  put(x, y, inner ? BG : PANEL);
  if (shapes.some(f => f(x, y))) put(x, y, ACC);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('src-tauri/icons', { recursive: true });
writeFileSync('src-tauri/icons/source.png', png);
console.log('wrote src-tauri/icons/source.png');
