/* Kontrola zakázaných API: aplikace nesmí spouštět procesy, sahat do cizí paměti ani komunikovat po síti.
   0.30.0: jediná výjimka pro síť je volitelný AI asistent v src-tauri/src/ai.rs (klient ureq s rustls, pevní hostitelé
   HTTPS, jen z hlavního okna; podrobně hlídá tests/safety-ai.test.ts) a 0.33.0 volitelná kontrola nové verze
   v src-tauri/src/update.rs (jen pevná adresa api.github.com, společný klient z ai.rs; hlídá tests/safety-update.test.ts).
   Jinde síť dál nesmí být. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/* 0.30.0: jediný soubor se síťovým klientem (a v jeho testech místní zkušební server 127.0.0.1) */
const NET_RS = ['src-tauri/src/ai.rs', 'src-tauri/src/update.rs'];
const NET_WORDS = ['ureq'];
const FORBIDDEN = [
  'std::process::Command', 'process::Command', 'OpenProcess', 'ReadProcessMemory', 'WriteProcessMemory', 'CreateRemoteThread',
  'reqwest', 'ureq', 'hyper::', 'TcpStream', 'UdpSocket', 'XMLHttpRequest', 'WebSocket', 'fetch(', 'child_process', 'navigator.sendBeacon', 'EventSource',
];

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some(e => name.endsWith(e))) out.push(p);
  }
  return out;
}

describe('bezpečnost zdrojového kódu', () => {
  const files = [...walk(join(root, 'src'), ['.ts', '.tsx']), ...walk(join(root, 'src-tauri', 'src'), ['.rs'])];
  it('najde zdrojové soubory', () => { expect(files.length).toBeGreaterThan(20); });
  for (const word of FORBIDDEN) {
    it(`neobsahuje ${word}`, () => {
      const hits = files.filter(f => readFileSync(f, 'utf8').includes(word)).map(f => f.slice(root.length).split('\\').join('/'));
      expect(hits).toEqual(NET_WORDS.includes(word) ? NET_RS : []);
    });
  }
  it('Cargo.toml nemá síťového klienta', () => {
    const cargo = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
    for (const dep of ['reqwest', 'hyper', 'tauri-plugin-http', 'tauri-plugin-updater', 'tauri-plugin-shell', 'native-tls', 'openssl']) expect(cargo.includes(dep), dep).toBe(false);
    /* 0.30.0: jen ureq s rustls, bez výchozích funkcí (bez native-tls a OpenSSL) */
    expect(cargo.match(/^ureq\b.*$/gm)).toEqual(['ureq = { version = "3.5", default-features = false, features = ["rustls"] }']);
  });
  it('CSP povoluje jen vlastní obsah a IPC', () => {
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const csp: string = conf.app.security.csp;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('connect-src ipc: http://ipc.localhost');
    expect(csp).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
    expect(conf.plugins?.updater).toBeUndefined();
  });
  it('oprávnění okna jsou jen základní', () => {
    /* 0.16.1: místo core:default jen poslech událostí a vlastní příkazy (úplný seznam hlídá tests/safety-acl.test.ts) */
    const cap = JSON.parse(readFileSync(join(root, 'src-tauri', 'capabilities', 'main.json'), 'utf8'));
    expect(cap.windows).toEqual(['main']);
    const core = (cap.permissions as string[]).filter(p => p.startsWith('core:'));
    expect(core).toEqual(['core:event:allow-listen', 'core:event:allow-unlisten']);
  });
});
