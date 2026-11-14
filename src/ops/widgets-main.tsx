import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/latin-ext-600.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '../ui/tokens.css';
/* štítky typů míst (barvy a glyfy) u položek seznamu k nalezení */
import '../ui/maps.css';
import './widgets.css';
import WidgetsApp from './WidgetsApp';
import { langReady } from '../i18n';
import { installDiag } from '../shell/diagLog';
import { ErrorBoundary } from '../ui/ErrorBoundary';

/* 0.28.0: chyby okna do místního deníku; po chybě vykreslení jen malý štítek v rohu (nic přes hru) */
installDiag();

/* 0.25.0: první vykreslení až se slovníkem výchozího jazyka okna (načítá se jen aktivní jazyk) */
void langReady().finally(() => createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary variant="pill"><WidgetsApp /></ErrorBoundary></React.StrictMode>));
