/* React vazba slovníku: komponenta, která volá useT() nebo useLang(), se po změně jazyka překreslí (bez restartu
   a bez ztráty místního stavu). */
import { useCallback, useSyncExternalStore } from 'react';
import { getLang, subscribeLang, tl, type Key, type Lang, type MsgRef, type Params } from './index';

export const useLang = (): Lang => useSyncExternalStore(subscribeLang, getLang, getLang);

export type TFn = ((key: Key, params?: Params) => string) & { lang: Lang; m: (ref: MsgRef) => string };

export function useT(): TFn {
  const lang = useLang();
  const t = useCallback((key: Key, params?: Params) => tl(lang, key, params), [lang]) as TFn;
  t.lang = lang;
  t.m = (ref: MsgRef) => tl(lang, ref.key, ref.params);
  return t;
}
