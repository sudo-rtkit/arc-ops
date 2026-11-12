/* Ikony oznamovací oblasti (0.9.0): PNG z docs/design/icon/v1 (tray-dark / tray-light, 16 a 32 px) převede na
   surová RGBA data pro Rust (include_bytes!, bez knihovny pro dekódování obrázků v aplikaci).
   Spuštění: node scripts/gen-tray-icons.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const src = new URL('../docs/design/icon/v1/', import.meta.url);
const out = new URL('../src-tauri/icons/tray/', import.meta.url);
for (const theme of ['dark', 'light']) {
  for (const size of [16, 32]) {
    const png = PNG.sync.read(readFileSync(new URL(`tray-${theme}-${size}.png`, src)));
    if (png.width !== size || png.height !== size) throw new Error(`tray-${theme}-${size}.png: ${png.width}x${png.height}`);
    writeFileSync(new URL(`tray-${theme}-${size}.rgba`, out), png.data);
    console.log(`tray-${theme}-${size}.rgba`, png.data.length);
  }
}
