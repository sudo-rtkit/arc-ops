import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-600.css';
import '../ui/tokens.css';
import './buddy.css';
import BuddyApp from './BuddyApp';
import { installDiag } from '../shell/diagLog';
import { ErrorBoundary } from '../ui/ErrorBoundary';

/* 0.28.0: chyby okna do místního deníku; po chybě vykreslení jen malé tlačítko pro nové načtení */
installDiag();

createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary variant="icon"><BuddyApp /></ErrorBoundary></React.StrictMode>);
