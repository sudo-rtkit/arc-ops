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
import '../ui/tokens.css';
/* 0.16.0: plné moduly v záložce Aplikace (overlay.css je poslední, takže jeho pravidla mají přednost) */
import '../ui/components.css';
import '../ui/modules.css';
import '../ui/maps.css';
import './overlay.css';
import OverlayApp from './OverlayApp';
import { langReady } from '../i18n';
import { installDiag } from '../shell/diagLog';
import { ErrorBoundary } from '../ui/ErrorBoundary';

/* 0.28.0: chyby okna do místního deníku */
installDiag();

/* 0.25.0: první vykreslení až se slovníkem výchozího jazyka okna (načítá se jen aktivní jazyk) */
void langReady().finally(() => createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary variant="full"><OverlayApp /></ErrorBoundary></React.StrictMode>));
