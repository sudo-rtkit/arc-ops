/* 0.13.1: automatický buddy jen nad hrou nebo nad vlastním oknem aplikace. Rozhodování (popředí hra / vlastní / jiné /
   žádné a zpoždění schování) testuje cargo test v src-tauri/src/ops.rs; tady se hlídá, že zůstává v jediné hlídací
   smyčce a že se buddy ukazuje bez aktivace okna. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (f: string) => readFileSync(fileURLToPath(new URL('../../' + f, import.meta.url)), 'utf8');
const ops = read('src-tauri/src/ops.rs');
const code = ops.slice(0, ops.indexOf('#[cfg(test)]'));

describe('buddy podle okna v popředí (0.13.1)', () => {
  it('jediná hlídací smyčka čte popředí každý krok a seznam procesů jen jednou za sekundu', () => {
    expect(code.match(/\bloop \{/g)).toHaveLength(1);
    const watch = code.slice(code.indexOf('pub async fn ops_watch'), code.indexOf('/* ----- viditelnost buddyho'));
    expect(watch).toContain('std::thread::sleep(WATCH_TICK)');
    expect(watch).toMatch(/now\.duration_since\(t\) >= WATCH_EVERY/);
    expect(watch).toContain('classify_foreground(foreground_pid(), own, &pids)');
    expect(watch).toContain('gate.update(shown, fg, now)');
    expect(watch).toContain('"ops:game-visible"');
    expect(code).toMatch(/const HIDE_AFTER: Duration = Duration::from_millis\((3|4|5)\d\d\);/);
  });

  it('popředí se jen čte, nic se neaktivuje; buddy se ukáže bez aktivace', () => {
    const fg = code.slice(code.indexOf('pub fn foreground_pid'), code.indexOf('pub fn game_window_shown'));
    expect(fg).toContain('GetForegroundWindow()');
    expect(fg).not.toMatch(/SetForegroundWindow|SetFocus|SetActiveWindow|ShowWindow/);
    expect(code).toContain('SW_SHOWNOACTIVATE');
    const reveal = code.slice(code.indexOf('pub async fn buddy_reveal'), code.indexOf('/* Overlay uprostřed'));
    expect(reveal).toContain('window.label() != BUDDY');
    expect(reveal).not.toMatch(/set_focus|SetForegroundWindow/);
    expect(read('src-tauri/src/lib.rs')).toContain('ops::buddy_reveal');
    const buddy = read('src/ops/BuddyApp.tsx');
    expect(buddy).toContain('native.buddyReveal()');
    expect(buddy).not.toMatch(/await a\.win\.show\(\);/);
  });
});
