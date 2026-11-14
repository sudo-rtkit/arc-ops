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
import './ui/maps.css';
import App from './App';
import { app } from './store';
import { LANGS, ensureLang, langReady } from './i18n';

import { hub } from './ops/mainHub';
import { startWindowCtl } from './shell/windowCtl';
import './ui/compact.css';

const booted = app.init();
/* milník 5: buddy, overlay a zkratka (bez zapnutí v Nastavení nic nedělá) */
hub.start();
/* 0.9.0: režim okna, křížek a oznamovací oblast. Zavření křížkem řeší windowCtl (uloží stav, pak skryje nebo
   ukončí); bez připraveného frontendu Rust okno zavře jako dřív. */
startWindowCtl();

/* Před zavřením okna dopsat rozpracované uložení. */
window.addEventListener('beforeunload', () => { void app.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void app.flush(); });

/* 0.25.0: první vykreslení až s načteným stavem a slovníkem jeho jazyka (okno načítá jen slovník aktivního jazyka),
   takže se nic nevykreslí v jiném jazyce, než je uložený. Když načtení stavu trvá déle než BOOT_WAIT_MS, okno se
   vykreslí v jazyce systému (s ukazatelem načítání) a jazyk se přepne celý najednou, jakmile je slovník načtený.
   Druhý slovník se načte až v klidu po startu (hledání v obou jazycích). */
const BOOT_WAIT_MS = 1500;
void Promise.race([booted.catch(() => undefined), new Promise(r => setTimeout(r, BOOT_WAIT_MS))])
  .then(() => langReady())
  .finally(() => {
    createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
    setTimeout(() => { for (const l of LANGS) void ensureLang(l); }, 5000);
  });
