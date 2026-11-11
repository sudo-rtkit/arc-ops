import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/latin-ext-600.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-ext-700.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-ext-500.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './ui/tokens.css';
import './ui/base.css';
import './ui/components.css';
import './ui/modules.css';
import App from './App';
import { app } from './store';
import { isTauri } from './storage/tauri';

import { hub } from './ops/mainHub';

void app.init();
/* milník 5: buddy, overlay a zkratka (bez zapnutí v Nastavení nic nedělá) */
hub.start();

/* Před zavřením okna dopsat rozpracované uložení. */
window.addEventListener('beforeunload', () => { void app.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void app.flush(); });
if (isTauri()) {
  void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    void getCurrentWindow().onCloseRequested(async () => { await app.flush(); });
  });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
