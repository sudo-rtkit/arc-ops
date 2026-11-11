import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup, ERR_INVALID, ERR_NEWER } from '../../src/core/backup';
import { defaultState } from '../../src/core/state';
import { SAMPLE_V1 } from './sample';

describe('záloha', () => {
  it('export a import vrátí stejný stav', () => {
    const s = defaultState(3);
    s.profile.level = 40; s.inventory = { 'Metal Parts': 5 };
    const parsed = parseBackup(makeBackup(s), 3);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) { expect(parsed.kind).toBe('app'); expect(parsed.state).toEqual(s); }
  });
  it('rozpozná zálohu deníku', () => {
    const parsed = parseBackup(JSON.stringify(SAMPLE_V1));
    expect('error' in parsed ? parsed.error : parsed.kind).toBe('diary');
  });
  it('odmítne vyšší schéma a neplatný JSON', () => {
    expect(parseBackup('{nic')).toEqual({ error: ERR_INVALID });
    expect(parseBackup('[]')).toEqual({ error: ERR_INVALID });
    expect(parseBackup('{"foo":1}')).toEqual({ error: ERR_INVALID });
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 4, state: {} }))).toEqual({ error: ERR_NEWER });
    expect(parseBackup(JSON.stringify({ schema: 9 }))).toEqual({ error: ERR_NEWER });
  });
  it('snese BOM na začátku souboru', () => {
    const parsed = parseBackup('﻿' + makeBackup(defaultState(1)), 1);
    expect('error' in parsed).toBe(false);
  });
});
