import { describe, expect, it } from 'vitest';
import { OPS, emptyBuddy, normalizeBuddy, resolveForm, levelEvent } from '../../src/core/ops';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';

describe('selectable buddy bodies', () => {
  it('offers all five bodies at any level without changing automatic defaults', () => {
    expect(OPS.forms).toHaveLength(5);
    expect(resolveForm(0).id).toBe('rookie');
    expect(resolveForm(75).id).toBe('legend');
    for (const form of OPS.forms) {
      expect(resolveForm(0, form.id).id).toBe(form.id);
      expect(resolveForm(75, form.id).id).toBe(form.id);
    }
    expect(resolveForm(75, 'unknown').id).toBe('legend');
  });
  it('loads older states and drops malformed form selections', () => {
    expect(normalizeBuddy({})).toEqual(emptyBuddy());
    for (const form of ['unknown', '__proto__', null, 5, {}]) expect(normalizeBuddy({ form }).form).toBeUndefined();
    expect(normalizeBuddy({ form: 'veteran' }).form).toBe('veteran');
  });
  it('keeps level rewards without playing a different body transformation in manual mode', () => {
    expect(levelEvent(14, 15)?.kind).toBe('transform');
    expect(levelEvent(14, 15, 'rookie')).toMatchObject({ kind: 'unlock', level: 15 });
    expect(levelEvent(15, 14, 'rookie')).toBeNull();
  });
  it('persists the choice independently of profile level and can return to automatic', async () => {
    const kv = memoryKV();
    const storage = createBrowserStorage(kv);
    const app = createApp(storage, { debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    const before = structuredClone(app.store.getState().state.profile);
    app.actions.setBuddy({ form: 'legend' });
    expect(app.store.getState().state.buddy.form).toBe('legend');
    expect(app.store.getState().state.profile).toEqual(before);
    await app.flush();
    const loaded = createApp(storage, { debounceMs: 0, weekCheckMs: 0 });
    await loaded.init();
    expect(loaded.store.getState().state.buddy.form).toBe('legend');
    loaded.actions.setBuddy({ form: 'unknown' });
    expect(loaded.store.getState().state.buddy.form).toBe('legend');
    loaded.actions.setBuddy({ form: 'auto' });
    expect(loaded.store.getState().state.buddy.form).toBeUndefined();
  });
});
