/* 0.30.0: modul „Zeptej se Opse“ v hlavním okně (a v panelu Aplikace polní konzole). Obsah je ui/AskOps.tsx. */
import { PageHead, Panel } from '../ui/components';
import { AskOps } from '../ui/AskOps';
import { useT } from '../i18n/react';

export default function AskOpsPage() {
  const t = useT();
  return (
    <div className="page">
      <PageHead title={t('nav.ask')} sub={t('ai.page.sub')} />
      <Panel title={t('ai.page.panel')}>
        <AskOps />
      </Panel>
    </div>
  );
}
