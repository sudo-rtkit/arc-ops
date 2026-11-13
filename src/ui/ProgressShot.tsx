/* Profil → „Načíst ze snímku“ (0.10.1): hráč vloží snímek obrazovky hry (profil, dílna, detail stanice, úkol, skill
   tree). Snímek se jednou přečte (core/vision/progress.ts) a zahodí; v paměti zůstanou jen přečtená čísla a názvy.
   Návrh se ukáže ve stejné revizi jako v overlayi a zapíše se až po potvrzení (actions.importProgress). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { actions, useAppState } from '../store';
import { Btn, Panel, cx } from './components';
import { decodeImage, imagesFrom } from './imageFile';
import { readProgress, type ProgressRead } from '../core/vision/progress';
import type { ProgressApply } from '../core/progressImport';
import { ProgressReview } from './ProgressReview';
import { hotkeyLabel } from '../ops/hotkey';
import { useT } from '../i18n/react';

export function ProgressShot({ focus }: { focus?: boolean }) {
  const t = useT();
  const s = useAppState();
  const [shot, setShot] = useState<{ id: number; read: ProgressRead } | null>(null);
  const [error, setError] = useState<'none' | 'err' | null>(null);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => { if (focus) boxRef.current?.scrollIntoView({ block: 'center' }); }, [focus]);

  const add = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy(true); setError(null); setDone(null); setShot(null);
    const r = await decodeImage(f);
    if (typeof r === 'string') { setError('err'); setBusy(false); return; }
    await new Promise(res => setTimeout(res, 0));
    const read = readProgress(r.img);
    r.bitmap.close();
    if (!read) setError('none'); else setShot({ id: nextId.current++, read });
    setBusy(false);
  }, []);

  /* Ctrl+V na stránce Profilu */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void add(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  const write = async (input: ProgressApply) => {
    setWriting(true);
    const sum = await actions.importProgress(input, 'screenshot-file');
    setWriting(false);
    if (sum) { setDone(sum.fields); setShot(null); }
  };

  return (
    <Panel title={t('profile.shot.title')} id="profile-shot">
      <div ref={boxRef} className="stack-sm" data-testid="progress-shot">
        <p className="meta">{t('profile.shot.text')}</p>
        {s.buddy.enabled && s.buddy.hotkey && <p className="meta">{t('profile.shot.hotkey', { key: hotkeyLabel(s.buddy.hotkey) })}</p>}
        <div className={cx('scan-drop', 'compact', dragging && 'over')}
          onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void add(imagesFrom(e.dataTransfer)); }}>
          <p>{t('profile.shot.drop')}</p>
          <Btn size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>{t('profile.shot.pick')}</Btn>
          <input ref={fileRef} type="file" accept="image/*" hidden data-testid="progress-shot-file"
            onChange={e => { void add([...(e.target.files || [])]); e.target.value = ''; }} />
        </div>
        {busy && <p className="meta" role="status">{t('scan.busy')}</p>}
        {error && <p className="danger-text" role="alert" data-testid="progress-shot-error">{t(error === 'none' ? 'profile.shot.none' : 'profile.shot.err')}</p>}
        {done !== null && <p className="banner info" role="status" data-testid="progress-shot-done"><span className="banner-text">{t('progress.done', { count: done })}</span></p>}
        {shot && <ProgressReview read={shot.read} id={shot.id} variant="app" writing={writing} onWrite={x => void write(x)} onDiscard={() => setShot(null)} />}
      </div>
    </Panel>
  );
}
